use chrono::{DateTime, Datelike, Duration, FixedOffset, TimeZone, Timelike, Utc};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::collections::BTreeMap;

use crate::analytics::resolve_range;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkPoint {
    bucket: String,
    label: String,
    rx_bytes: Option<u64>,
    tx_bytes: Option<u64>,
    observed_seconds: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkApplication {
    app_id: String,
    app_name: String,
    scope: String,
    rx_bytes: u64,
    tx_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkHealth {
    state: String,
    detail: String,
    updated_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkData {
    pub range_label: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub observed_seconds: i64,
    pub coverage_percent: f64,
    pub health: NetworkHealth,
    pub timeline: Vec<NetworkPoint>,
    pub applications: Vec<NetworkApplication>,
    pub archived_days: i64,
    pub archived_activity_days: i64,
}

fn day_start(value: &str) -> Result<DateTime<FixedOffset>, String> {
    DateTime::parse_from_rfc3339(&format!("{value}T00:00:00+05:30"))
        .map_err(|error| error.to_string())
}

fn table_exists(connection: &Connection, name: &str) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [name],
            |row| row.get(0),
        )
        .unwrap_or(false)
}

pub fn read_network(database: &str, key: &str) -> Result<NetworkData, String> {
    let connection = Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())?;
    connection
        .busy_timeout(std::time::Duration::from_secs(3))
        .map_err(|e| e.to_string())?;
    // One snapshot: a compaction transaction cannot make rows disappear between
    // reading detail and reading summaries (or make them appear twice).
    connection
        .execute_batch("BEGIN DEFERRED")
        .map_err(|e| e.to_string())?;
    let ist = FixedOffset::east_opt(19_800).unwrap();
    let now = Utc::now().with_timezone(&ist);
    let fallback = resolve_range("today")?;
    let mut range = if key == "all" {
        fallback
    } else {
        resolve_range(key)?
    };
    let mut data = NetworkData {
        range_label: range.label.clone(),
        rx_bytes: 0,
        tx_bytes: 0,
        observed_seconds: 0,
        coverage_percent: 0.0,
        health: NetworkHealth {
            state: "not_running".into(),
            detail: "Start the HyprTrack collector to record internet usage.".into(),
            updated_at: None,
        },
        timeline: vec![],
        applications: vec![],
        archived_days: 0,
        archived_activity_days: 0,
    };
    if !table_exists(&connection, "network_samples") {
        return Ok(data);
    }
    if key == "all" {
        let earliest: Option<i64> = connection.query_row(
            "SELECT MIN(ts) FROM (SELECT MIN(sampled_at) ts FROM network_samples UNION ALL SELECT MIN(started_at) FROM network_coverage)",
            [], |r| r.get(0)).map_err(|e| e.to_string())?;
        let archived: Option<String> = connection
            .query_row("SELECT MIN(day) FROM network_daily_summaries", [], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        let mut start = earliest
            .and_then(|ts| ist.timestamp_opt(ts, 0).single())
            .unwrap_or(range.start);
        if let Some(day) = archived {
            start = start.min(day_start(&day)?);
        }
        range.start = start
            .with_hour(0)
            .unwrap()
            .with_minute(0)
            .unwrap()
            .with_second(0)
            .unwrap();
        range.label = "All recorded history".into();
        data.range_label = range.label.clone();
    }
    if let Ok((state, detail, timestamp)) = connection.query_row(
        "SELECT state, detail, updated_at FROM network_status WHERE id=1",
        [],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
            ))
        },
    ) {
        let stale =
            matches!(state.as_str(), "recording" | "starting") && now.timestamp() - timestamp > 20;
        data.health = NetworkHealth {
            state: if stale { "stale".into() } else { state },
            detail: if stale {
                "The collector has stopped reporting. Existing history is safe.".into()
            } else {
                detail
            },
            updated_at: ist
                .timestamp_opt(timestamp, 0)
                .single()
                .map(|dt| dt.to_rfc3339()),
        };
    }
    let monthly = key == "all" && (range.end - range.start).num_days() > 90;
    let bucket_key = |dt: DateTime<FixedOffset>| -> String {
        if key == "today" {
            dt.format("%Y-%m-%dT%H").to_string()
        } else if monthly {
            dt.format("%Y-%m").to_string()
        } else {
            dt.format("%Y-%m-%d").to_string()
        }
    };
    let mut buckets: BTreeMap<String, (DateTime<FixedOffset>, u64, u64, i64)> = BTreeMap::new();
    let mut cursor = range.start;
    while cursor < range.end {
        buckets.insert(bucket_key(cursor), (cursor, 0, 0, 0));
        cursor = if key == "today" {
            cursor + Duration::hours(1)
        } else if monthly {
            let (year, month) = if cursor.month() == 12 {
                (cursor.year() + 1, 1)
            } else {
                (cursor.year(), cursor.month() + 1)
            };
            ist.with_ymd_and_hms(year, month, 1, 0, 0, 0)
                .single()
                .ok_or("Invalid month")?
        } else {
            cursor + Duration::days(1)
        };
    }
    let mut apps: BTreeMap<(String, String), NetworkApplication> = BTreeMap::new();
    let mut add =
        |timestamp: i64, app_id: String, name: String, scope: String, rx: i64, tx: i64| {
            let Some(dt) = ist.timestamp_opt(timestamp, 0).single() else {
                return;
            };
            let rx = rx.max(0) as u64;
            let tx = tx.max(0) as u64;
            let app = apps
                .entry((app_id.clone(), scope.clone()))
                .or_insert(NetworkApplication {
                    app_id,
                    app_name: name,
                    scope,
                    rx_bytes: 0,
                    tx_bytes: 0,
                });
            app.rx_bytes += rx;
            app.tx_bytes += tx;
            if let Some(bucket) = buckets.get_mut(&bucket_key(dt)) {
                bucket.1 += rx;
                bucket.2 += tx;
            }
            data.rx_bytes += rx;
            data.tx_bytes += tx;
        };
    let mut statement = connection.prepare("SELECT sampled_at, app_id, app_name, scope, rx_bytes, tx_bytes FROM network_samples WHERE sampled_at>=?1 AND sampled_at<=?2").map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([range.start.timestamp(), range.end.timestamp()], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (ts, id, name, scope, rx, tx) = row.map_err(|e| e.to_string())?;
        add(ts, id, name, scope, rx, tx);
    }
    let mut statement = connection.prepare("SELECT day, app_id, app_name, scope, rx_bytes, tx_bytes FROM network_daily_summaries WHERE day>=?1 AND day<=?2").map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(
            [
                range.start.format("%Y-%m-%d").to_string(),
                range.end.format("%Y-%m-%d").to_string(),
            ],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, i64>(5)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (day, id, name, scope, rx, tx) = row.map_err(|e| e.to_string())?;
        add(day_start(&day)?.timestamp(), id, name, scope, rx, tx);
    }
    drop(add);
    // Coverage intervals are bounded by flush duration; split at chart bucket boundaries.
    let mut statement = connection
        .prepare(
            "SELECT started_at, ended_at FROM network_coverage WHERE ended_at>?1 AND started_at<?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([range.start.timestamp(), range.end.timestamp()], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (start, end) = row.map_err(|e| e.to_string())?;
        let mut start = start.max(range.start.timestamp());
        let end = end.min(range.end.timestamp());
        while start < end {
            let dt = ist
                .timestamp_opt(start, 0)
                .single()
                .ok_or("Invalid coverage timestamp")?;
            let next = ((start + 19_800) / 3600 + 1) * 3600 - 19_800;
            let seconds = (end.min(next) - start).max(0);
            if let Some(bucket) = buckets.get_mut(&bucket_key(dt)) {
                bucket.3 += seconds;
            }
            data.observed_seconds += seconds;
            start += seconds;
        }
    }
    let mut statement = connection
        .prepare(
            "SELECT day, observed_seconds FROM network_daily_coverage WHERE day>=?1 AND day<=?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(
            [
                range.start.format("%Y-%m-%d").to_string(),
                range.end.format("%Y-%m-%d").to_string(),
            ],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
        )
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (day, seconds) = row.map_err(|e| e.to_string())?;
        if let Some(bucket) = buckets.get_mut(&bucket_key(day_start(&day)?)) {
            bucket.3 += seconds;
        }
        data.observed_seconds += seconds;
    }
    let duration = (range.end - range.start).num_seconds().max(1);
    data.coverage_percent = ((data.observed_seconds as f64 / duration as f64) * 1000.0)
        .round()
        .clamp(0.0, 1000.0)
        / 10.0;
    data.timeline = buckets
        .into_iter()
        .map(|(key, (dt, rx, tx, seconds))| NetworkPoint {
            label: if key.contains('T') {
                dt.format("%-I %p").to_string()
            } else if monthly {
                dt.format("%b %Y").to_string()
            } else {
                dt.format("%d %b").to_string()
            },
            bucket: key,
            rx_bytes: (seconds > 0 || rx > 0 || tx > 0).then_some(rx),
            tx_bytes: (seconds > 0 || rx > 0 || tx > 0).then_some(tx),
            observed_seconds: seconds,
        })
        .collect();
    data.applications = apps.into_values().collect();
    data.applications
        .sort_by_key(|app| std::cmp::Reverse(app.rx_bytes + app.tx_bytes));
    data.archived_days = connection
        .query_row(
            "SELECT COUNT(DISTINCT day) FROM network_daily_summaries",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    data.archived_activity_days = connection
        .query_row(
            "SELECT COUNT(DISTINCT day) FROM activity_daily_summaries",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::initialize_database;

    #[test]
    fn combines_archived_and_recent_usage_without_treating_gaps_as_zero() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("network.db");
        initialize_database(&path).unwrap();
        let connection = Connection::open(&path).unwrap();
        connection.execute_batch("INSERT INTO network_daily_summaries VALUES ('2026-01-01', 'zen', 'Zen', 'app', 1000, 100); INSERT INTO network_daily_coverage VALUES ('2026-01-01', 10);").unwrap();
        let now = Utc::now().timestamp() - 2;
        connection
            .execute(
                "INSERT INTO network_samples VALUES (?1, 'zen', 'Zen', 'app', 500, 50)",
                [now],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO network_coverage VALUES (?1, ?2)",
                [now - 5, now],
            )
            .unwrap();
        let all = read_network(path.to_str().unwrap(), "all").unwrap();
        assert_eq!((all.rx_bytes, all.tx_bytes), (1500, 150));
        assert_eq!(all.applications.len(), 1);
        assert_eq!(all.observed_seconds, 15);
        assert!(all.timeline.iter().any(|point| point.rx_bytes.is_none()));
        assert_eq!(all.archived_days, 1);
        let today = read_network(path.to_str().unwrap(), "today").unwrap();
        assert_eq!(today.rx_bytes, 500);
        assert!(read_network(path.to_str().unwrap(), "invalid").is_err());
    }
}

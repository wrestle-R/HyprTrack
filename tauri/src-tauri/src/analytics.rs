use chrono::{DateTime, Datelike, Duration, FixedOffset, TimeZone, Timelike, Utc};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

const RANGE_TODAY: &str = "today";
const RANGE_7D: &str = "7d";
const RANGE_30D: &str = "30d";

#[derive(Clone)]
pub struct EffectiveRange {
    pub key: String,
    pub start: DateTime<FixedOffset>,
    pub end: DateTime<FixedOffset>,
    pub label: String,
}

#[derive(Clone)]
struct ActivitySample {
    sampled_at: DateTime<FixedOffset>,
    ended_at: Option<DateTime<FixedOffset>>,
    app_class: String,
    window_title: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RangePayload {
    pub key: String,
    pub start: String,
    pub end: String,
    pub label: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySession {
    pub start_at: String,
    pub end_at: String,
    pub app_class: String,
    pub window_title: String,
    pub duration_minutes: f64,
    pub sample_count: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationUsage {
    pub window_title: String,
    pub app_class: String,
    pub minutes: f64,
    pub share: f64,
    pub session_count: usize,
    pub first_seen: String,
    pub last_seen: String,
    pub recent_sessions: Vec<ActivitySession>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelinePoint {
    pub bucket: String,
    pub label: String,
    pub minutes: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewData {
    pub range: RangePayload,
    pub tracked_minutes: f64,
    pub top_application: Option<ApplicationUsage>,
    pub streak_days: usize,
    pub timeline: Vec<TimelinePoint>,
    pub applications: Vec<ApplicationUsage>,
    pub recent_sessions: Vec<ActivitySession>,
    pub latest_sample_at: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub page: usize,
    pub page_size: usize,
    pub total_items: usize,
    pub total_pages: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityData {
    pub range: RangePayload,
    pub sessions: Vec<ActivitySession>,
    pub app_classes: Vec<String>,
    pub pagination: Pagination,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationsData {
    pub range: RangePayload,
    pub items: Vec<ApplicationUsage>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthData {
    pub status: &'static str,
    pub sample_count: i64,
    pub latest_sample_at: Option<String>,
}

fn ist() -> FixedOffset {
    FixedOffset::east_opt(5 * 3600 + 30 * 60).expect("valid IST offset")
}

fn parse_time(value: &str) -> Result<DateTime<FixedOffset>, String> {
    DateTime::parse_from_rfc3339(value).map_err(|error| error.to_string())
}

fn format_seconds(value: DateTime<FixedOffset>) -> String {
    value.format("%Y-%m-%dT%H:%M:%S%:z").to_string()
}

fn format_original_precision(value: DateTime<FixedOffset>, source: &str) -> String {
    if source.contains('.') {
        value.format("%Y-%m-%dT%H:%M:%S%.3f%:z").to_string()
    } else {
        format_seconds(value)
    }
}

fn open_database(database_path: &str) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(
        database_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| error.to_string())?;

    let mut statement = connection
        .prepare("PRAGMA table_info(activity_samples)")
        .map_err(|error| error.to_string())?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let required = ["sampled_at", "app_class", "window_title"];
    if columns.is_empty() || required.iter().any(|column| !columns.iter().any(|candidate| candidate == column)) {
        return Err("The activity database schema is not supported.".into());
    }
    drop(statement);

    Ok(connection)
}

pub fn resolve_range(range: &str) -> Result<EffectiveRange, String> {
    let key = match range {
        RANGE_TODAY | RANGE_7D | RANGE_30D => range,
        _ => return Err("Invalid range".into()),
    };
    let now = Utc::now().with_timezone(&ist());
    let days = match key {
        RANGE_TODAY => 1,
        RANGE_7D => 7,
        RANGE_30D => 30,
        _ => unreachable!(),
    };
    let midnight = ist()
        .with_ymd_and_hms(now.year(), now.month(), now.day(), 0, 0, 0)
        .single()
        .ok_or_else(|| "Could not resolve IST midnight.".to_string())?;

    Ok(EffectiveRange {
        key: key.to_string(),
        start: midnight - Duration::days((days - 1) as i64),
        end: now,
        label: match key {
            RANGE_TODAY => "Today".to_string(),
            RANGE_7D => "7 days".to_string(),
            RANGE_30D => "30 days".to_string(),
            _ => unreachable!(),
        },
    })
}

fn range_payload(range: &EffectiveRange) -> RangePayload {
    RangePayload {
        key: range.key.clone(),
        start: format_seconds(range.start),
        end: format_seconds(range.end),
        label: range.label.clone(),
    }
}

fn add_minute(sampled_at: &DateTime<FixedOffset>) -> DateTime<FixedOffset> {
    *sampled_at + Duration::minutes(1)
}

fn read_samples(
    connection: &Connection,
    range: &EffectiveRange,
) -> Result<Vec<ActivitySample>, String> {
    let mut statement = connection
        .prepare("PRAGMA table_info(activity_samples)")
        .map_err(|error| error.to_string())?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let has_intervals = columns.iter().any(|column| column == "ended_at")
        && columns.iter().any(|column| column == "last_seen_at");

    let query = if has_intervals {
        "SELECT sampled_at, app_class, window_title, ended_at, last_seen_at
         FROM activity_samples
         WHERE sampled_at <= ?
           AND (sampled_at >= ? OR ended_at >= ? OR last_seen_at >= ?)
         ORDER BY sampled_at ASC"
    } else {
        "SELECT sampled_at, app_class, window_title, NULL AS ended_at, NULL AS last_seen_at
         FROM activity_samples
         WHERE sampled_at >= ? AND sampled_at <= ?
         ORDER BY sampled_at ASC"
    };

    let mut statement = connection.prepare(query).map_err(|error| error.to_string())?;
    let params: Vec<String> = if has_intervals {
        vec![
            format_seconds(range.end),
            format_seconds(range.start),
            format_seconds(range.start),
            format_seconds(range.start),
        ]
    } else {
        vec![format_seconds(range.start), format_seconds(range.end)]
    };

    let mapped = statement
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|error| error.to_string())?;

    let mut samples = Vec::new();
    for row in mapped {
        let (sampled_at_raw, app_class, window_title, ended_at_raw, last_seen_raw) =
            row.map_err(|error| error.to_string())?;
        let sampled_at = parse_time(&sampled_at_raw)?;
        let legacy_end = add_minute(&sampled_at);
        let effective_end = if let Some(ref ended_at) = ended_at_raw {
            parse_time(ended_at)?
        } else if let Some(ref last_seen_at) = last_seen_raw {
            parse_time(last_seen_at)?
        } else {
            legacy_end
        };

        let clipped_start = if sampled_at > range.start {
            sampled_at
        } else {
            range.start
        };
        let clipped_end = if effective_end < range.end {
            effective_end
        } else {
            range.end
        };
        if clipped_end <= clipped_start {
            continue;
        }

        samples.push(ActivitySample {
            sampled_at: clipped_start,
            ended_at: Some(clipped_end),
            app_class,
            window_title,
        });
    }

    Ok(samples)
}

fn sample_minutes(sample: &ActivitySample) -> f64 {
    let end = sample.ended_at.unwrap_or_else(|| add_minute(&sample.sampled_at));
    ((end.timestamp_millis() - sample.sampled_at.timestamp_millis()) as f64) / 60_000.0
}

fn round_minutes(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn build_sessions(samples: &[ActivitySample]) -> Vec<ActivitySession> {
    let mut ordered = samples.to_vec();
    ordered.sort_by_key(|sample| sample.sampled_at.timestamp_millis());
    let mut sessions: Vec<ActivitySession> = Vec::new();

    for sample in ordered {
        let end = sample.ended_at.unwrap_or_else(|| add_minute(&sample.sampled_at));
        let is_continuation = sessions.last().map_or(false, |current| {
            if current.app_class != sample.app_class || current.window_title != sample.window_title {
                return false;
            }
            let current_end = parse_time(&current.end_at).ok();
            current_end
                .map(|value| {
                    sample.sampled_at.timestamp_millis() - value.timestamp_millis() <= 90_000
                })
                .unwrap_or(false)
        });

        if is_continuation {
            let current = sessions.last_mut().expect("session exists");
            current.sample_count += 1;
            current.duration_minutes = round_minutes(current.duration_minutes + sample_minutes(&sample));
            current.end_at = format_original_precision(end, &current.end_at);
        } else {
            let duration_minutes = round_minutes(sample_minutes(&sample));
            sessions.push(ActivitySession {
                start_at: format_original_precision(sample.sampled_at, &format_seconds(sample.sampled_at)),
                end_at: format_original_precision(end, &format_seconds(end)),
                app_class: sample.app_class,
                window_title: sample.window_title,
                duration_minutes,
                sample_count: 1,
            });
        }
    }

    sessions
}

fn build_applications(samples: &[ActivitySample]) -> Vec<ApplicationUsage> {
    let total_minutes: f64 = samples.iter().map(sample_minutes).sum();
    let sessions = build_sessions(samples);
    let mut entries: Vec<(String, String, f64, String, String)> = Vec::new();

    for sample in samples {
        let minutes = sample_minutes(sample);
        if let Some(entry) = entries.iter_mut().find(|entry| entry.0 == sample.app_class && entry.1 == sample.window_title) {
            entry.2 += minutes;
            entry.4 = format_original_precision(
                sample.ended_at.unwrap_or_else(|| add_minute(&sample.sampled_at)),
                &entry.4,
            );
        } else {
            let first_seen = format_original_precision(sample.sampled_at, &format_seconds(sample.sampled_at));
            let last_seen = format_original_precision(
                sample.ended_at.unwrap_or_else(|| add_minute(&sample.sampled_at)),
                &format_seconds(sample.sampled_at),
            );
            entries.push((
                sample.app_class.clone(),
                sample.window_title.clone(),
                minutes,
                first_seen,
                last_seen,
            ));
        }
    }

    let mut applications = entries
        .into_iter()
        .map(|(app_class, window_title, minutes, first_seen, last_seen)| {
            let recent_sessions = sessions
                .iter()
                .filter(|session| session.app_class == app_class && session.window_title == window_title)
                .cloned()
                .rev()
                .take(5)
                .collect::<Vec<_>>();
            ApplicationUsage {
                window_title,
                app_class,
                minutes: round_minutes(minutes),
                share: if total_minutes == 0.0 {
                    0.0
                } else {
                    ((minutes / total_minutes) * 10_000.0).round() / 100.0
                },
                session_count: recent_sessions.len(),
                first_seen,
                last_seen,
                recent_sessions,
            }
        })
        .collect::<Vec<_>>();

    applications.sort_by(|left, right| {
        right
            .minutes
            .partial_cmp(&left.minutes)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.window_title.cmp(&right.window_title))
    });
    applications
}

fn build_timeline(samples: &[ActivitySample], range: &EffectiveRange) -> Vec<TimelinePoint> {
    let mut points = Vec::new();
    if range.key == RANGE_TODAY {
        for hour in 0..=range.end.hour() {
            let start = ist()
                .with_ymd_and_hms(range.start.year(), range.start.month(), range.start.day(), hour, 0, 0)
                .single()
                .expect("valid hour");
            let end = start + Duration::hours(1);
            let minutes: f64 = samples
                .iter()
                .map(|sample| {
                    let sample_end = sample.ended_at.unwrap_or_else(|| add_minute(&sample.sampled_at));
                    let overlap_start = if sample.sampled_at > start { sample.sampled_at } else { start };
                    let overlap_end = if sample_end < end { sample_end } else { end };
                    if overlap_end <= overlap_start {
                        0.0
                    } else {
                        (overlap_end.timestamp_millis() - overlap_start.timestamp_millis()) as f64 / 60_000.0
                    }
                })
                .sum();
            let label = if hour == range.end.hour() {
                range.end.format("%-d %b · %-I:%M %P").to_string()
            } else {
                format!("{hour:02}:00")
            };
            points.push(TimelinePoint {
                bucket: format!("{}T{hour:02}", range.start.format("%Y-%m-%d")),
                label,
                minutes: round_minutes(minutes),
            });
        }
    } else {
        let days = if range.key == RANGE_7D { 7 } else { 30 };
        for index in 0..days {
            let start = range.start + Duration::days(index as i64);
            let end = start + Duration::days(1);
            let minutes: f64 = samples
                .iter()
                .map(|sample| {
                    let sample_end = sample.ended_at.unwrap_or_else(|| add_minute(&sample.sampled_at));
                    let overlap_start = if sample.sampled_at > start { sample.sampled_at } else { start };
                    let overlap_end = if sample_end < end { sample_end } else { end };
                    if overlap_end <= overlap_start {
                        0.0
                    } else {
                        (overlap_end.timestamp_millis() - overlap_start.timestamp_millis()) as f64 / 60_000.0
                    }
                })
                .sum();
            let label = if index == days - 1 {
                range.end.format("%-d %b · %-I:%M %P").to_string()
            } else {
                start.format("%b %-d").to_string()
            };
            points.push(TimelinePoint {
                bucket: start.format("%Y-%m-%d").to_string(),
                label,
                minutes: round_minutes(minutes),
            });
        }
    }
    points
}

fn calculate_streak(connection: &Connection, end: &DateTime<FixedOffset>) -> Result<usize, String> {
    let mut statement = connection
        .prepare("SELECT sampled_at FROM activity_samples WHERE sampled_at <= ? ORDER BY sampled_at ASC")
        .map_err(|error| error.to_string())?;
    let values = statement
        .query_map([format_seconds(*end)], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut days = values
        .iter()
        .map(|value| parse_time(value).map(|dt| dt.date_naive()))
        .collect::<Result<Vec<_>, _>>()?;
    days.sort();
    days.dedup();
    if days.is_empty() {
        return Ok(0);
    }

    let mut streak = 1;
    for index in (1..days.len()).rev() {
        if (days[index] - days[index - 1]).num_days() != 1 {
            break;
        }
        streak += 1;
    }
    Ok(streak)
}

pub fn read_overview(database_path: &str, range_key: &str) -> Result<OverviewData, String> {
    let connection = open_database(database_path)?;
    let range = resolve_range(range_key)?;
    let samples = read_samples(&connection, &range)?;
    let applications = build_applications(&samples);
    let recent_sessions = build_sessions(&samples)
        .into_iter()
        .rev()
        .take(6)
        .collect::<Vec<_>>();
    let tracked_minutes = round_minutes(samples.iter().map(sample_minutes).sum());
    let streak_days = calculate_streak(&connection, &range.end)?;
    let latest_sample_at = connection
        .query_row("SELECT MAX(sampled_at) FROM activity_samples", [], |row| row.get::<_, Option<String>>(0))
        .map_err(|error| error.to_string())?;

    Ok(OverviewData {
        range: range_payload(&range),
        tracked_minutes,
        top_application: applications.first().cloned(),
        streak_days,
        timeline: build_timeline(&samples, &range),
        applications,
        recent_sessions,
        latest_sample_at,
    })
}

pub fn read_activity(
    database_path: &str,
    range_key: &str,
    app: Option<String>,
    search: Option<String>,
    page: usize,
    page_size: usize,
) -> Result<ActivityData, String> {
    let connection = open_database(database_path)?;
    let range = resolve_range(range_key)?;
    let samples = read_samples(&connection, &range)?;
    let mut app_classes = samples.iter().map(|sample| sample.app_class.clone()).collect::<Vec<_>>();
    app_classes.sort();
    app_classes.dedup();
    let normalized_search = search.unwrap_or_default().trim().to_lowercase();
    let filtered = samples
        .into_iter()
        .filter(|sample| {
            let matches_app = app.as_ref().map(|value| value == &sample.app_class).unwrap_or(true);
            let matches_search = normalized_search.is_empty()
                || sample.app_class.to_lowercase().contains(&normalized_search)
                || sample.window_title.to_lowercase().contains(&normalized_search);
            matches_app && matches_search
        })
        .collect::<Vec<_>>();
    let mut sessions = build_sessions(&filtered);
    sessions.reverse();
    let total_items = sessions.len();
    let total_pages = total_items.max(1).div_ceil(page_size.max(1));
    let page = page.max(1);
    let start_index = (page - 1) * page_size;
    let paged = sessions.into_iter().skip(start_index).take(page_size).collect::<Vec<_>>();

    Ok(ActivityData {
        range: range_payload(&range),
        sessions: paged,
        app_classes,
        pagination: Pagination {
            page,
            page_size,
            total_items,
            total_pages,
        },
    })
}

pub fn read_applications(
    database_path: &str,
    range_key: &str,
    search: Option<String>,
) -> Result<ApplicationsData, String> {
    let connection = open_database(database_path)?;
    let range = resolve_range(range_key)?;
    let samples = read_samples(&connection, &range)?;
    let normalized_search = search.unwrap_or_default().trim().to_lowercase();
    let items = build_applications(&samples)
        .into_iter()
        .filter(|application| {
            normalized_search.is_empty()
                || application.app_class.to_lowercase().contains(&normalized_search)
                || application.window_title.to_lowercase().contains(&normalized_search)
        })
        .collect::<Vec<_>>();

    Ok(ApplicationsData {
        range: range_payload(&range),
        items,
    })
}

pub fn read_health(database_path: &str) -> Result<HealthData, String> {
    let connection = open_database(database_path)?;
    let (sample_count, latest_sample_at) = connection
        .query_row(
            "SELECT COUNT(sampled_at), MAX(sampled_at) FROM activity_samples",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map_err(|error| error.to_string())?;

    Ok(HealthData {
        status: "connected",
        sample_count,
        latest_sample_at,
    })
}

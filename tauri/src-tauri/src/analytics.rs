use chrono::{DateTime, Datelike, Duration, FixedOffset, TimeZone, Timelike, Utc};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};

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

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MappingRule {
    #[serde(rename = "id")]
    pub _id: String,
    pub match_text: String,
    pub display_label: String,
    pub enabled: bool,
    pub is_default: bool,
}

fn normalize_native_app_label(class_key: &str) -> Option<&'static str> {
    match class_key {
        "tauri" => Some("HyprTrack Desktop App"),
        _ => None,
    }
}

fn browser_suffixes(class_key: &str) -> &'static [&'static str] {
    match class_key {
        "zen" => &[" — Zen Browser"],
        "brave" | "brave-browser" => &[" - Brave"],
        "brave-origin" | "brave-origin-nightly" => &[" - Brave Origin"],
        _ => &[],
    }
}

fn strip_browser_suffix(class_key: &str, value: &str) -> String {
    let mut title = value.trim().to_string();
    for suffix in browser_suffixes(class_key) {
        if title.ends_with(suffix) {
            title.truncate(title.len() - suffix.len());
            title = title.trim().to_string();
            break;
        }
    }
    title
}

fn resolve_browser_source_title(
    class_key: &str,
    window_title: &str,
    window_full: Option<&str>,
) -> String {
    let Some(full_title) = window_full.map(str::trim).filter(|value| !value.is_empty()) else {
        return window_title.to_string();
    };

    if browser_suffixes(class_key)
        .iter()
        .any(|suffix| full_title.ends_with(suffix))
    {
        full_title.to_string()
    } else {
        window_title.to_string()
    }
}

fn is_probable_chatgpt_conversation_title(title: &str) -> bool {
    let stripped = title.trim();
    !stripped.is_empty()
        && !stripped.starts_with('(')
        && !stripped.contains(" - ")
        && !stripped.contains(" | ")
        && !stripped.contains(" · ")
        && stripped.split_whitespace().count() >= 3
}

fn normalize_display_labels_with_mappings(
    app_class: &str,
    window_title: &str,
    window_full: Option<&str>,
    mapping_rules: &[MappingRule],
) -> (String, String) {
    let class_key = app_class.trim().to_lowercase();
    let normalized_app_class = normalize_native_app_label(&class_key)
        .unwrap_or(app_class)
        .to_string();
    let source_title = window_full
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(window_title);
    let folded_source_title = source_title.to_lowercase();

    for default_group in [false, true] {
        if let Some(rule) = mapping_rules.iter().find(|rule| {
            rule.enabled
                && rule.is_default == default_group
                && !rule.match_text.trim().is_empty()
                && folded_source_title.contains(&rule.match_text.trim().to_lowercase())
        }) {
            return (normalized_app_class, rule.display_label.trim().to_string());
        }
    }

    if let Some(label) = normalize_native_app_label(&class_key) {
        let next_title = if window_title.trim().eq_ignore_ascii_case(&class_key) {
            label.to_string()
        } else {
            window_title.to_string()
        };
        return (label.to_string(), next_title);
    }

    if browser_suffixes(&class_key).is_empty() {
        return (app_class.to_string(), window_title.to_string());
    }

    let raw_title = strip_browser_suffix(
        &class_key,
        &resolve_browser_source_title(&class_key, window_title, window_full),
    );
    let folded_title = raw_title.to_lowercase();

    if folded_title == "your repositories" {
        return (app_class.to_string(), "GitHub".to_string());
    }

    if matches!(
        folded_title.as_str(),
        "home | blogs" | "running out of excuses" | "russel daniel paul"
    ) {
        return (app_class.to_string(), "Personal Websites".to_string());
    }

    if folded_title == "x"
        || folded_title.starts_with("x ")
        || folded_title.ends_with(" on x:")
        || folded_title.contains(" on x: ")
    {
        return (app_class.to_string(), "X".to_string());
    }

    for (marker, label) in [
        ("chatgpt", "ChatGPT"),
        ("claude", "Claude"),
        ("github", "GitHub"),
        ("leetcode", "LeetCode"),
        ("vercel", "Vercel"),
        ("whatsapp", "WhatsApp"),
        ("x.com", "X"),
        ("youtube", "YouTube"),
    ] {
        if folded_title.contains(marker) {
            return (app_class.to_string(), label.to_string());
        }
    }

    let is_repo = regex_like_repository(&raw_title)
        || regex_like_repository_context(&raw_title)
        || raw_title
            .split_once(':')
            .is_some_and(|(repository, _)| regex_like_repository(repository.trim()));
    if is_repo {
        return (app_class.to_string(), "GitHub".to_string());
    }

    if let Some((_, service)) = raw_title.rsplit_once(" - ") {
        let service = service.trim();
        if !service.is_empty() {
            return (app_class.to_string(), service.to_string());
        }
    }

    if is_probable_chatgpt_conversation_title(&raw_title) {
        return (app_class.to_string(), "ChatGPT".to_string());
    }

    (app_class.to_string(), window_title.to_string())
}

fn regex_like_repository(value: &str) -> bool {
    let mut parts = value.split('/');
    matches!(
        (parts.next(), parts.next(), parts.next()),
        (Some(left), Some(right), None)
            if !left.is_empty()
                && !right.is_empty()
                && left.chars().all(is_repository_char)
                && right.chars().all(is_repository_char)
    )
}

fn regex_like_repository_context(value: &str) -> bool {
    if let Some((_, repository)) = value.rsplit_once(" · ") {
        return regex_like_repository(repository);
    }
    false
}

fn is_repository_char(value: char) -> bool {
    value.is_ascii_alphanumeric() || matches!(value, '_' | '.' | '-')
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
pub struct FocusQuality {
    pub focused_minutes: f64,
    pub continuity_percent: f64,
    pub longest_focused_block_minutes: f64,
    pub average_session_minutes: f64,
    pub context_switches: usize,
    pub switches_per_tracked_hour: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparisonValue {
    pub current: f64,
    pub previous: f64,
    pub percent_change: Option<f64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InsightComparisons {
    pub tracked_minutes: ComparisonValue,
    pub focus_continuity: ComparisonValue,
    pub average_session_minutes: ComparisonValue,
    pub switches_per_tracked_hour: ComparisonValue,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RhythmCell {
    pub day_index: usize,
    pub day_label: String,
    pub hour: u32,
    pub tracked_minutes: f64,
    pub focused_minutes: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyInsightPoint {
    pub bucket: String,
    pub label: String,
    pub tracked_minutes: f64,
    pub focused_minutes: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InsightHighlights {
    pub peak_working_window: Option<String>,
    pub strongest_focus_day: Option<String>,
    pub most_fragmented_day: Option<String>,
    pub longest_focused_block_minutes: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InsightsData {
    pub range: RangePayload,
    pub comparisons: InsightComparisons,
    pub rhythm: Vec<RhythmCell>,
    pub daily_trend: Vec<DailyInsightPoint>,
    pub highlights: InsightHighlights,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastHourCoverage {
    pub tracked_minutes: f64,
    pub untracked_minutes: f64,
    pub coverage_percent: f64,
    pub window_start: String,
    pub window_end: String,
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
    pub focus_quality: FocusQuality,
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
    pub last_hour_coverage: LastHourCoverage,
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
    if columns.is_empty()
        || required
            .iter()
            .any(|column| !columns.iter().any(|candidate| candidate == column))
    {
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
    mapping_rules: &[MappingRule],
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

    let has_window_full = columns.iter().any(|column| column == "window_full");

    let query = if has_intervals {
        if has_window_full {
            "SELECT sampled_at, app_class, window_title, window_full, ended_at, last_seen_at
         FROM activity_samples
         WHERE sampled_at <= ?
           AND (sampled_at >= ? OR ended_at >= ? OR last_seen_at >= ?)
         ORDER BY sampled_at ASC"
        } else {
            "SELECT sampled_at, app_class, window_title, NULL AS window_full, ended_at, last_seen_at
         FROM activity_samples
         WHERE sampled_at <= ?
           AND (sampled_at >= ? OR ended_at >= ? OR last_seen_at >= ?)
         ORDER BY sampled_at ASC"
        }
    } else {
        if has_window_full {
            "SELECT sampled_at, app_class, window_title, window_full, NULL AS ended_at, NULL AS last_seen_at
         FROM activity_samples
         WHERE sampled_at >= ? AND sampled_at <= ?
         ORDER BY sampled_at ASC"
        } else {
            "SELECT sampled_at, app_class, window_title, NULL AS window_full, NULL AS ended_at, NULL AS last_seen_at
         FROM activity_samples
         WHERE sampled_at >= ? AND sampled_at <= ?
         ORDER BY sampled_at ASC"
        }
    };

    let mut statement = connection
        .prepare(query)
        .map_err(|error| error.to_string())?;
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
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|error| error.to_string())?;

    let mut samples = Vec::new();
    for row in mapped {
        let (sampled_at_raw, app_class, window_title, window_full, ended_at_raw, last_seen_raw) =
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

        let (app_class, window_title) = normalize_display_labels_with_mappings(
            &app_class,
            &window_title,
            window_full.as_deref(),
            mapping_rules,
        );

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
    let end = sample
        .ended_at
        .unwrap_or_else(|| add_minute(&sample.sampled_at));
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
        let end = sample
            .ended_at
            .unwrap_or_else(|| add_minute(&sample.sampled_at));
        let is_continuation = sessions.last().is_some_and(|current| {
            if current.app_class != sample.app_class || current.window_title != sample.window_title
            {
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
            current.duration_minutes =
                round_minutes(current.duration_minutes + sample_minutes(&sample));
            current.end_at = format_original_precision(end, &current.end_at);
        } else {
            let duration_minutes = round_minutes(sample_minutes(&sample));
            sessions.push(ActivitySession {
                start_at: format_original_precision(
                    sample.sampled_at,
                    &format_seconds(sample.sampled_at),
                ),
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

fn count_context_switches(sessions: &[ActivitySession]) -> usize {
    sessions
        .windows(2)
        .filter(|pair| {
            let previous = &pair[0];
            let current = &pair[1];
            if previous.app_class == current.app_class
                && previous.window_title == current.window_title
            {
                return false;
            }
            match (parse_time(&previous.end_at), parse_time(&current.start_at)) {
                (Ok(previous_end), Ok(current_start)) => {
                    let gap = current_start.timestamp_millis() - previous_end.timestamp_millis();
                    (0..=300_000).contains(&gap)
                }
                _ => false,
            }
        })
        .count()
}

fn calculate_focus_quality(
    sessions: &[ActivitySession],
    focus_threshold_minutes: f64,
) -> FocusQuality {
    let tracked_minutes: f64 = sessions
        .iter()
        .map(|session| session.duration_minutes)
        .sum();
    let focused_minutes: f64 = sessions
        .iter()
        .filter(|session| session.duration_minutes >= focus_threshold_minutes)
        .map(|session| session.duration_minutes)
        .sum();
    let longest_focused_block_minutes = sessions
        .iter()
        .filter(|session| session.duration_minutes >= focus_threshold_minutes)
        .map(|session| session.duration_minutes)
        .fold(0.0, f64::max);
    let context_switches = count_context_switches(sessions);

    FocusQuality {
        focused_minutes: round_minutes(focused_minutes),
        continuity_percent: if tracked_minutes == 0.0 {
            0.0
        } else {
            round_minutes((focused_minutes / tracked_minutes) * 100.0)
        },
        longest_focused_block_minutes: round_minutes(longest_focused_block_minutes),
        average_session_minutes: if sessions.is_empty() {
            0.0
        } else {
            round_minutes(tracked_minutes / sessions.len() as f64)
        },
        context_switches,
        switches_per_tracked_hour: if tracked_minutes == 0.0 {
            0.0
        } else {
            round_minutes(context_switches as f64 / (tracked_minutes / 60.0))
        },
    }
}

fn comparison_value(current: f64, previous: f64) -> ComparisonValue {
    ComparisonValue {
        current: round_minutes(current),
        previous: round_minutes(previous),
        percent_change: if previous == 0.0 {
            None
        } else {
            Some(round_minutes(((current - previous) / previous) * 100.0))
        },
    }
}

fn previous_range(range: &EffectiveRange) -> EffectiveRange {
    let duration = range.end - range.start;
    let (start, end) = if range.key == RANGE_TODAY {
        let start = range.start - Duration::days(1);
        (start, start + duration)
    } else {
        (range.start - duration, range.start)
    };

    EffectiveRange {
        key: range.key.clone(),
        start,
        end,
        label: format!("Previous {}", range.label.to_lowercase()),
    }
}

fn overlap_minutes(
    start: DateTime<FixedOffset>,
    end: DateTime<FixedOffset>,
    bucket_start: DateTime<FixedOffset>,
    bucket_end: DateTime<FixedOffset>,
) -> f64 {
    let overlap_start = if start > bucket_start {
        start
    } else {
        bucket_start
    };
    let overlap_end = if end < bucket_end { end } else { bucket_end };
    if overlap_end <= overlap_start {
        0.0
    } else {
        (overlap_end.timestamp_millis() - overlap_start.timestamp_millis()) as f64 / 60_000.0
    }
}

fn session_interval(
    session: &ActivitySession,
) -> Option<(DateTime<FixedOffset>, DateTime<FixedOffset>)> {
    Some((
        parse_time(&session.start_at).ok()?,
        parse_time(&session.end_at).ok()?,
    ))
}

fn build_rhythm(
    samples: &[ActivitySample],
    sessions: &[ActivitySession],
    range: &EffectiveRange,
    focus_threshold_minutes: f64,
) -> Vec<RhythmCell> {
    let day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let day_count = if range.key == RANGE_TODAY { 1 } else { 7 };
    let mut tracked = vec![0.0; day_count * 24];
    let mut focused = vec![0.0; day_count * 24];

    let cell_index = |value: DateTime<FixedOffset>| -> usize {
        let day = if range.key == RANGE_TODAY {
            0
        } else {
            value.weekday().num_days_from_monday() as usize
        };
        day * 24 + value.hour() as usize
    };

    for sample in samples {
        let sample_end = sample
            .ended_at
            .unwrap_or_else(|| add_minute(&sample.sampled_at));
        let mut cursor = sample.sampled_at;
        while cursor < sample_end {
            let bucket_start = ist()
                .with_ymd_and_hms(
                    cursor.year(),
                    cursor.month(),
                    cursor.day(),
                    cursor.hour(),
                    0,
                    0,
                )
                .single()
                .expect("valid hour bucket");
            let bucket_end = bucket_start + Duration::hours(1);
            tracked[cell_index(cursor)] +=
                overlap_minutes(sample.sampled_at, sample_end, bucket_start, bucket_end);
            cursor = if bucket_end > cursor {
                bucket_end
            } else {
                cursor + Duration::hours(1)
            };
        }
    }

    for session in sessions
        .iter()
        .filter(|session| session.duration_minutes >= focus_threshold_minutes)
    {
        let Some((session_start, session_end)) = session_interval(session) else {
            continue;
        };
        let mut cursor = session_start;
        while cursor < session_end {
            let bucket_start = ist()
                .with_ymd_and_hms(
                    cursor.year(),
                    cursor.month(),
                    cursor.day(),
                    cursor.hour(),
                    0,
                    0,
                )
                .single()
                .expect("valid hour bucket");
            let bucket_end = bucket_start + Duration::hours(1);
            focused[cell_index(cursor)] +=
                overlap_minutes(session_start, session_end, bucket_start, bucket_end);
            cursor = if bucket_end > cursor {
                bucket_end
            } else {
                cursor + Duration::hours(1)
            };
        }
    }

    (0..day_count)
        .flat_map(|day_index| {
            let tracked = tracked.clone();
            let focused = focused.clone();
            (0..24).map(move |hour| {
                let index = day_index * 24 + hour;
                RhythmCell {
                    day_index,
                    day_label: if day_count == 1 {
                        "Today".to_string()
                    } else {
                        day_labels[day_index].to_string()
                    },
                    hour: hour as u32,
                    tracked_minutes: round_minutes(tracked[index]),
                    focused_minutes: round_minutes(focused[index]),
                }
            })
        })
        .collect()
}

fn build_focus_trend(
    samples: &[ActivitySample],
    sessions: &[ActivitySession],
    range: &EffectiveRange,
    focus_threshold_minutes: f64,
) -> Vec<DailyInsightPoint> {
    let bucket_count = if range.key == RANGE_TODAY {
        range.end.hour() as usize + 1
    } else if range.key == RANGE_7D {
        7
    } else {
        30
    };
    let bucket_duration = if range.key == RANGE_TODAY {
        Duration::hours(1)
    } else {
        Duration::days(1)
    };

    (0..bucket_count)
        .map(|index| {
            let bucket_start = range.start + bucket_duration * index as i32;
            let bucket_end = if bucket_start + bucket_duration > range.end {
                range.end
            } else {
                bucket_start + bucket_duration
            };
            let tracked_minutes: f64 = samples
                .iter()
                .map(|sample| {
                    overlap_minutes(
                        sample.sampled_at,
                        sample
                            .ended_at
                            .unwrap_or_else(|| add_minute(&sample.sampled_at)),
                        bucket_start,
                        bucket_end,
                    )
                })
                .sum();
            let focused_minutes: f64 = sessions
                .iter()
                .filter(|session| session.duration_minutes >= focus_threshold_minutes)
                .filter_map(session_interval)
                .map(|(start, end)| overlap_minutes(start, end, bucket_start, bucket_end))
                .sum();

            DailyInsightPoint {
                bucket: if range.key == RANGE_TODAY {
                    bucket_start.format("%Y-%m-%dT%H").to_string()
                } else {
                    bucket_start.format("%Y-%m-%d").to_string()
                },
                label: if range.key == RANGE_TODAY {
                    bucket_start.format("%-I %P").to_string()
                } else {
                    bucket_start.format("%b %-d").to_string()
                },
                tracked_minutes: round_minutes(tracked_minutes),
                focused_minutes: round_minutes(focused_minutes),
            }
        })
        .collect()
}

fn build_highlights(
    rhythm: &[RhythmCell],
    daily_trend: &[DailyInsightPoint],
    sessions: &[ActivitySession],
    focus_quality: &FocusQuality,
) -> InsightHighlights {
    let peak = rhythm
        .iter()
        .max_by(|left, right| {
            left.tracked_minutes
                .partial_cmp(&right.tracked_minutes)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .filter(|cell| cell.tracked_minutes > 0.0);
    let strongest = daily_trend
        .iter()
        .max_by(|left, right| {
            left.focused_minutes
                .partial_cmp(&right.focused_minutes)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .filter(|point| point.focused_minutes > 0.0);

    let mut fragmented: Vec<(String, usize)> = Vec::new();
    for session in sessions {
        let Ok(start) = parse_time(&session.start_at) else {
            continue;
        };
        let key = start.format("%Y-%m-%d").to_string();
        if fragmented.iter().all(|entry| entry.0 != key) {
            let same_day = sessions
                .iter()
                .filter(|candidate| candidate.start_at.starts_with(&key))
                .cloned()
                .collect::<Vec<_>>();
            fragmented.push((key, count_context_switches(&same_day)));
        }
    }
    let most_fragmented = fragmented
        .iter()
        .max_by_key(|entry| entry.1)
        .filter(|entry| entry.1 > 0)
        .and_then(|entry| parse_time(&format!("{}T00:00:00+05:30", entry.0)).ok());

    InsightHighlights {
        peak_working_window: peak.map(|cell| {
            format!(
                "{} · {:02}:00–{:02}:00",
                cell.day_label,
                cell.hour,
                (cell.hour + 1) % 24
            )
        }),
        strongest_focus_day: strongest.map(|point| point.label.clone()),
        most_fragmented_day: most_fragmented.map(|day| day.format("%b %-d").to_string()),
        longest_focused_block_minutes: focus_quality.longest_focused_block_minutes,
    }
}

fn build_applications(samples: &[ActivitySample]) -> Vec<ApplicationUsage> {
    let total_minutes: f64 = samples.iter().map(sample_minutes).sum();
    let sessions = build_sessions(samples);
    let mut entries: Vec<(String, String, f64, String, String)> = Vec::new();

    for sample in samples {
        let minutes = sample_minutes(sample);
        if let Some(entry) = entries
            .iter_mut()
            .find(|entry| entry.0 == sample.app_class && entry.1 == sample.window_title)
        {
            entry.2 += minutes;
            entry.4 = format_original_precision(
                sample
                    .ended_at
                    .unwrap_or_else(|| add_minute(&sample.sampled_at)),
                &entry.4,
            );
        } else {
            let first_seen =
                format_original_precision(sample.sampled_at, &format_seconds(sample.sampled_at));
            let last_seen = format_original_precision(
                sample
                    .ended_at
                    .unwrap_or_else(|| add_minute(&sample.sampled_at)),
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
        .map(
            |(app_class, window_title, minutes, first_seen, last_seen)| {
                let recent_sessions = sessions
                    .iter()
                    .filter(|session| {
                        session.app_class == app_class && session.window_title == window_title
                    })
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
            },
        )
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
                .with_ymd_and_hms(
                    range.start.year(),
                    range.start.month(),
                    range.start.day(),
                    hour,
                    0,
                    0,
                )
                .single()
                .expect("valid hour");
            let end = start + Duration::hours(1);
            let minutes: f64 = samples
                .iter()
                .map(|sample| {
                    let sample_end = sample
                        .ended_at
                        .unwrap_or_else(|| add_minute(&sample.sampled_at));
                    let overlap_start = if sample.sampled_at > start {
                        sample.sampled_at
                    } else {
                        start
                    };
                    let overlap_end = if sample_end < end { sample_end } else { end };
                    if overlap_end <= overlap_start {
                        0.0
                    } else {
                        (overlap_end.timestamp_millis() - overlap_start.timestamp_millis()) as f64
                            / 60_000.0
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
                    let sample_end = sample
                        .ended_at
                        .unwrap_or_else(|| add_minute(&sample.sampled_at));
                    let overlap_start = if sample.sampled_at > start {
                        sample.sampled_at
                    } else {
                        start
                    };
                    let overlap_end = if sample_end < end { sample_end } else { end };
                    if overlap_end <= overlap_start {
                        0.0
                    } else {
                        (overlap_end.timestamp_millis() - overlap_start.timestamp_millis()) as f64
                            / 60_000.0
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

fn calculate_last_hour_coverage(
    connection: &Connection,
    window_end: DateTime<FixedOffset>,
) -> Result<LastHourCoverage, String> {
    let window_start = window_end - Duration::minutes(60);
    let range = EffectiveRange {
        key: "last-hour".into(),
        start: window_start,
        end: window_end,
        label: "Last 60 minutes".into(),
    };
    let tracked_minutes = round_minutes(
        read_samples(connection, &range, &[])?
            .iter()
            .map(sample_minutes)
            .sum(),
    );
    let untracked_minutes = round_minutes((60.0 - tracked_minutes).max(0.0));
    let coverage_percent = round_minutes((tracked_minutes / 60.0) * 100.0);
    Ok(LastHourCoverage {
        tracked_minutes,
        untracked_minutes,
        coverage_percent,
        window_start: format_seconds(window_start),
        window_end: format_seconds(window_end),
    })
}

fn calculate_streak(connection: &Connection, end: &DateTime<FixedOffset>) -> Result<usize, String> {
    let mut statement = connection
        .prepare(
            "SELECT sampled_at FROM activity_samples WHERE sampled_at <= ? ORDER BY sampled_at ASC",
        )
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

pub fn read_overview(
    database_path: &str,
    range_key: &str,
    focus_threshold_minutes: f64,
    mapping_rules: &[MappingRule],
) -> Result<OverviewData, String> {
    let connection = open_database(database_path)?;
    let range = resolve_range(range_key)?;
    let samples = read_samples(&connection, &range, mapping_rules)?;
    let applications = build_applications(&samples);
    let sessions = build_sessions(&samples);
    let recent_sessions = sessions
        .iter()
        .cloned()
        .into_iter()
        .rev()
        .take(6)
        .collect::<Vec<_>>();
    let tracked_minutes = round_minutes(samples.iter().map(sample_minutes).sum());
    let streak_days = calculate_streak(&connection, &range.end)?;
    let latest_sample_at = connection
        .query_row("SELECT MAX(sampled_at) FROM activity_samples", [], |row| {
            row.get::<_, Option<String>>(0)
        })
        .map_err(|error| error.to_string())?;

    Ok(OverviewData {
        range: range_payload(&range),
        tracked_minutes,
        top_application: applications.first().cloned(),
        streak_days,
        timeline: build_timeline(&samples, &range),
        applications,
        recent_sessions,
        focus_quality: calculate_focus_quality(&sessions, focus_threshold_minutes),
        latest_sample_at,
    })
}

pub fn read_insights(
    database_path: &str,
    range_key: &str,
    focus_threshold_minutes: f64,
    mapping_rules: &[MappingRule],
) -> Result<InsightsData, String> {
    let connection = open_database(database_path)?;
    let range = resolve_range(range_key)?;
    let previous = previous_range(&range);
    let samples = read_samples(&connection, &range, mapping_rules)?;
    let previous_samples = read_samples(&connection, &previous, mapping_rules)?;
    let sessions = build_sessions(&samples);
    let previous_sessions = build_sessions(&previous_samples);
    let quality = calculate_focus_quality(&sessions, focus_threshold_minutes);
    let previous_quality = calculate_focus_quality(&previous_sessions, focus_threshold_minutes);
    let tracked_minutes = samples.iter().map(sample_minutes).sum::<f64>();
    let previous_tracked_minutes = previous_samples.iter().map(sample_minutes).sum::<f64>();
    let rhythm = build_rhythm(&samples, &sessions, &range, focus_threshold_minutes);
    let daily_trend = build_focus_trend(&samples, &sessions, &range, focus_threshold_minutes);
    let highlights = build_highlights(&rhythm, &daily_trend, &sessions, &quality);

    Ok(InsightsData {
        range: range_payload(&range),
        comparisons: InsightComparisons {
            tracked_minutes: comparison_value(tracked_minutes, previous_tracked_minutes),
            focus_continuity: comparison_value(
                quality.continuity_percent,
                previous_quality.continuity_percent,
            ),
            average_session_minutes: comparison_value(
                quality.average_session_minutes,
                previous_quality.average_session_minutes,
            ),
            switches_per_tracked_hour: comparison_value(
                quality.switches_per_tracked_hour,
                previous_quality.switches_per_tracked_hour,
            ),
        },
        rhythm,
        daily_trend,
        highlights,
    })
}

pub fn read_activity(
    database_path: &str,
    range_key: &str,
    app: Option<String>,
    search: Option<String>,
    page: usize,
    page_size: usize,
    mapping_rules: &[MappingRule],
) -> Result<ActivityData, String> {
    let connection = open_database(database_path)?;
    let range = resolve_range(range_key)?;
    let samples = read_samples(&connection, &range, mapping_rules)?;
    let mut app_classes = samples
        .iter()
        .map(|sample| sample.app_class.clone())
        .collect::<Vec<_>>();
    app_classes.sort();
    app_classes.dedup();
    let normalized_search = search.unwrap_or_default().trim().to_lowercase();
    let filtered = samples
        .into_iter()
        .filter(|sample| {
            let matches_app = app
                .as_ref()
                .map(|value| value == &sample.app_class)
                .unwrap_or(true);
            let matches_search = normalized_search.is_empty()
                || sample.app_class.to_lowercase().contains(&normalized_search)
                || sample
                    .window_title
                    .to_lowercase()
                    .contains(&normalized_search);
            matches_app && matches_search
        })
        .collect::<Vec<_>>();
    let mut sessions = build_sessions(&filtered);
    sessions.reverse();
    let total_items = sessions.len();
    let total_pages = total_items.max(1).div_ceil(page_size.max(1));
    let page = page.max(1);
    let start_index = (page - 1) * page_size;
    let paged = sessions
        .into_iter()
        .skip(start_index)
        .take(page_size)
        .collect::<Vec<_>>();

    Ok(ActivityData {
        range: range_payload(&range),
        sessions: paged,
        app_classes,
        last_hour_coverage: calculate_last_hour_coverage(&connection, range.end)?,
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
    mapping_rules: &[MappingRule],
) -> Result<ApplicationsData, String> {
    let connection = open_database(database_path)?;
    let range = resolve_range(range_key)?;
    let samples = read_samples(&connection, &range, mapping_rules)?;
    let normalized_search = search.unwrap_or_default().trim().to_lowercase();
    let items = build_applications(&samples)
        .into_iter()
        .filter(|application| {
            normalized_search.is_empty()
                || application
                    .app_class
                    .to_lowercase()
                    .contains(&normalized_search)
                || application
                    .window_title
                    .to_lowercase()
                    .contains(&normalized_search)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::initialize_database;
    use rusqlite::Connection;
    use tempfile::tempdir;

    fn session(
        start_at: &str,
        end_at: &str,
        app_class: &str,
        window_title: &str,
        duration_minutes: f64,
    ) -> ActivitySession {
        ActivitySession {
            start_at: start_at.to_string(),
            end_at: end_at.to_string(),
            app_class: app_class.to_string(),
            window_title: window_title.to_string(),
            duration_minutes,
            sample_count: 1,
        }
    }

    #[test]
    fn focus_quality_uses_threshold_and_ignores_switches_after_long_breaks() {
        let sessions = vec![
            session(
                "2026-06-14T09:00:00+05:30",
                "2026-06-14T09:30:00+05:30",
                "code",
                "VS Code",
                30.0,
            ),
            session(
                "2026-06-14T09:32:00+05:30",
                "2026-06-14T09:42:00+05:30",
                "zen",
                "GitHub",
                10.0,
            ),
            session(
                "2026-06-14T09:50:00+05:30",
                "2026-06-14T10:15:00+05:30",
                "code",
                "VS Code",
                25.0,
            ),
        ];

        let quality = calculate_focus_quality(&sessions, 25.0);

        assert_eq!(quality.focused_minutes, 55.0);
        assert_eq!(quality.continuity_percent, 84.62);
        assert_eq!(quality.longest_focused_block_minutes, 30.0);
        assert_eq!(quality.average_session_minutes, 21.67);
        assert_eq!(quality.context_switches, 1);
        assert_eq!(quality.switches_per_tracked_hour, 0.92);
    }

    #[test]
    fn comparison_has_no_percent_change_without_previous_baseline() {
        assert_eq!(comparison_value(20.0, 0.0).percent_change, None);
        assert_eq!(comparison_value(30.0, 20.0).percent_change, Some(50.0));
    }

    #[test]
    fn today_comparison_uses_yesterdays_equivalent_elapsed_window() {
        let range = EffectiveRange {
            key: RANGE_TODAY.to_string(),
            start: parse_time("2026-06-14T00:00:00+05:30").unwrap(),
            end: parse_time("2026-06-14T13:30:00+05:30").unwrap(),
            label: "Today".to_string(),
        };

        let previous = previous_range(&range);

        assert_eq!(format_seconds(previous.start), "2026-06-13T00:00:00+05:30");
        assert_eq!(format_seconds(previous.end), "2026-06-13T13:30:00+05:30");
    }

    #[test]
    fn today_rhythm_has_24_hour_cells_and_tracks_focused_overlap() {
        let range = EffectiveRange {
            key: RANGE_TODAY.to_string(),
            start: parse_time("2026-06-14T00:00:00+05:30").unwrap(),
            end: parse_time("2026-06-14T12:00:00+05:30").unwrap(),
            label: "Today".to_string(),
        };
        let samples = vec![ActivitySample {
            sampled_at: parse_time("2026-06-14T09:00:00+05:30").unwrap(),
            ended_at: Some(parse_time("2026-06-14T09:30:00+05:30").unwrap()),
            app_class: "code".to_string(),
            window_title: "VS Code".to_string(),
        }];
        let sessions = build_sessions(&samples);

        let rhythm = build_rhythm(&samples, &sessions, &range, 25.0);

        assert_eq!(rhythm.len(), 24);
        assert_eq!(rhythm[9].tracked_minutes, 30.0);
        assert_eq!(rhythm[9].focused_minutes, 30.0);
    }

    #[test]
    fn github_history_is_normalized_before_the_chatgpt_fallback() {
        assert_eq!(
            normalize_display_labels_with_mappings(
                "zen",
                "Your Repositories",
                Some("Your Repositories — Zen Browser"),
                &[],
            ),
            ("zen".to_string(), "GitHub".to_string()),
        );
        assert_eq!(
            normalize_display_labels_with_mappings(
                "zen",
                "ChatGPT",
                Some("wrestle-R/dots-hyprland: Usability-first dotfiles — Zen Browser"),
                &[],
            ),
            ("zen".to_string(), "GitHub".to_string()),
        );
    }

    #[test]
    fn custom_mapping_rules_override_builtin_normalization() {
        let rules = vec![MappingRule {
            _id: "custom-dotfiles".to_string(),
            match_text: "dots-hyprland".to_string(),
            display_label: "Dotfiles".to_string(),
            enabled: true,
            is_default: false,
        }];

        assert_eq!(
            normalize_display_labels_with_mappings(
                "zen",
                "GitHub",
                Some("wrestle-R/dots-hyprland: Usability-first dotfiles — Zen Browser"),
                &rules,
            ),
            ("zen".to_string(), "Dotfiles".to_string()),
        );
    }

    #[test]
    fn last_hour_coverage_caps_open_interval_at_last_seen() {
        let directory = tempdir().unwrap();
        let database = directory.path().join("hyprtrack.db");
        initialize_database(&database).unwrap();
        Connection::open(&database)
            .unwrap()
            .execute(
                "INSERT INTO activity_samples (
                    sampled_at, app_class, window_title, window_full,
                    ended_at, last_seen_at, window_address
                 ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6)",
                (
                    "2026-06-14T10:30:00+05:30",
                    "code",
                    "VS Code",
                    "HyprTrack - Visual Studio Code",
                    "2026-06-14T10:45:00+05:30",
                    "abc",
                ),
            )
            .unwrap();

        let connection = open_database(database.to_str().unwrap()).unwrap();
        let window_end = parse_time("2026-06-14T11:00:00+05:30").unwrap();
        let coverage = calculate_last_hour_coverage(&connection, window_end).unwrap();

        assert_eq!(coverage.tracked_minutes, 15.0);
        assert_eq!(coverage.untracked_minutes, 45.0);
        assert_eq!(coverage.coverage_percent, 25.0);
        assert_eq!(coverage.window_start, "2026-06-14T10:00:00+05:30");
        assert_eq!(coverage.window_end, "2026-06-14T11:00:00+05:30");
    }
}

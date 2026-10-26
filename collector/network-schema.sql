-- Additive schema shared by the desktop and the exported collector.
CREATE TABLE IF NOT EXISTS network_samples (
    sampled_at INTEGER NOT NULL,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('app', 'system', 'unknown')),
    rx_bytes INTEGER NOT NULL CHECK (rx_bytes >= 0),
    tx_bytes INTEGER NOT NULL CHECK (tx_bytes >= 0),
    PRIMARY KEY (sampled_at, app_id, scope)
);
CREATE TABLE IF NOT EXISTS network_daily_summaries (
    day TEXT NOT NULL,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    scope TEXT NOT NULL,
    rx_bytes INTEGER NOT NULL,
    tx_bytes INTEGER NOT NULL,
    PRIMARY KEY (day, app_id, scope)
);
CREATE TABLE IF NOT EXISTS network_coverage (
    started_at INTEGER PRIMARY KEY,
    ended_at INTEGER NOT NULL CHECK (ended_at >= started_at)
);
CREATE TABLE IF NOT EXISTS network_daily_coverage (
    day TEXT PRIMARY KEY,
    observed_seconds INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS network_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL,
    detail TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_daily_summaries (
    day TEXT NOT NULL,
    app_class TEXT NOT NULL,
    seconds REAL NOT NULL CHECK (seconds >= 0),
    interval_count INTEGER NOT NULL,
    PRIMARY KEY (day, app_class)
);
CREATE TABLE IF NOT EXISTS history_maintenance (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    compacted_before TEXT NOT NULL,
    completed_at INTEGER NOT NULL
);

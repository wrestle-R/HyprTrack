use rusqlite::{backup::Backup, Connection};
use std::{fs, path::Path};

#[derive(Debug, PartialEq, Eq)]
pub enum MigrationResult {
    Created,
    Existing,
    Imported { rows: i64 },
}

pub fn initialize_database(database_path: &Path) -> Result<(), String> {
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS activity_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sampled_at TEXT NOT NULL,
                app_class TEXT NOT NULL,
                window_title TEXT NOT NULL,
                window_full TEXT NOT NULL,
                ended_at TEXT,
                last_seen_at TEXT,
                window_address TEXT
            );",
        )
        .map_err(|error| error.to_string())?;

    let columns = connection
        .prepare("PRAGMA table_info(activity_samples)")
        .map_err(|error| error.to_string())?
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    for (column, declaration) in [
        ("window_full", "TEXT NOT NULL DEFAULT ''"),
        ("ended_at", "TEXT"),
        ("last_seen_at", "TEXT"),
        ("window_address", "TEXT"),
    ] {
        if !columns.iter().any(|candidate| candidate == column) {
            connection
                .execute(
                    &format!("ALTER TABLE activity_samples ADD COLUMN {column} {declaration}"),
                    [],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn sample_count(database_path: &Path) -> Result<i64, String> {
    Connection::open(database_path)
        .map_err(|error| error.to_string())?
        .query_row("SELECT COUNT(*) FROM activity_samples", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())
}

fn integrity_is_ok(database_path: &Path) -> Result<bool, String> {
    let result: String = Connection::open(database_path)
        .map_err(|error| error.to_string())?
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    Ok(result == "ok")
}

pub fn prepare_database(
    database_path: &Path,
    legacy_database: Option<&Path>,
) -> Result<MigrationResult, String> {
    if database_path
        .metadata()
        .map(|metadata| metadata.len() == 0)
        .unwrap_or(false)
    {
        fs::remove_file(database_path).map_err(|error| error.to_string())?;
    }
    if database_path.exists() {
        initialize_database(database_path)?;
        return Ok(MigrationResult::Existing);
    }
    if let Some(parent) = database_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    if let Some(source_path) = legacy_database.filter(|path| path.is_file()) {
        let source = Connection::open(source_path).map_err(|error| error.to_string())?;
        let mut destination = Connection::open(database_path).map_err(|error| error.to_string())?;
        Backup::new(&source, &mut destination)
            .map_err(|error| error.to_string())?
            .run_to_completion(32, std::time::Duration::from_millis(10), None)
            .map_err(|error| error.to_string())?;
        drop(destination);
        drop(source);

        initialize_database(database_path)?;
        if !integrity_is_ok(database_path)? {
            let _ = fs::remove_file(database_path);
            return Err("The imported activity database failed its integrity check.".into());
        }
        let source_rows = sample_count(source_path)?;
        let destination_rows = sample_count(database_path)?;
        if source_rows != destination_rows {
            let _ = fs::remove_file(database_path);
            return Err("The imported activity database row count did not match.".into());
        }
        return Ok(MigrationResult::Imported {
            rows: destination_rows,
        });
    }

    initialize_database(database_path)?;
    Ok(MigrationResult::Created)
}

pub fn recover_interrupted_activity(database_path: &Path) -> Result<usize, String> {
    initialize_database(database_path)?;
    Connection::open(database_path)
        .map_err(|error| error.to_string())?
        .execute(
            "UPDATE activity_samples
             SET ended_at = last_seen_at
             WHERE ended_at IS NULL AND last_seen_at IS NOT NULL",
            [],
        )
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::tempdir;

    #[test]
    fn initializes_and_upgrades_activity_schema() {
        let directory = tempdir().unwrap();
        let database = directory.path().join("legacy.db");
        let connection = Connection::open(&database).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE activity_samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sampled_at TEXT NOT NULL,
                    app_class TEXT NOT NULL,
                    window_title TEXT NOT NULL
                );",
            )
            .unwrap();
        drop(connection);

        initialize_database(&database).unwrap();

        let connection = Connection::open(database).unwrap();
        let columns = connection
            .prepare("PRAGMA table_info(activity_samples)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        for required in ["window_full", "ended_at", "last_seen_at", "window_address"] {
            assert!(columns.iter().any(|column| column == required));
        }
    }

    #[test]
    fn imports_legacy_database_once_and_preserves_source() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("source.db");
        let destination = directory.path().join("data/hyprtrack.db");
        initialize_database(&source).unwrap();
        Connection::open(&source)
            .unwrap()
            .execute(
                "INSERT INTO activity_samples
                 (sampled_at, app_class, window_title, window_full)
                 VALUES (?1, ?2, ?3, ?4)",
                (
                    "2026-06-14T10:00:00+05:30",
                    "code",
                    "VS Code",
                    "HyprTrack - Visual Studio Code",
                ),
            )
            .unwrap();

        assert_eq!(
            prepare_database(&destination, Some(&source)).unwrap(),
            MigrationResult::Imported { rows: 1 }
        );
        assert!(source.exists());
        assert_eq!(
            prepare_database(&destination, Some(&source)).unwrap(),
            MigrationResult::Existing
        );
    }

    #[test]
    fn replaces_empty_interrupted_destination_with_legacy_backup() {
        let directory = tempdir().unwrap();
        let source = directory.path().join("source.db");
        let destination = directory.path().join("data/hyprtrack.db");
        initialize_database(&source).unwrap();
        Connection::open(&source)
            .unwrap()
            .execute(
                "INSERT INTO activity_samples
                 (sampled_at, app_class, window_title, window_full)
                 VALUES (?1, ?2, ?3, ?4)",
                (
                    "2026-06-14T10:00:00+05:30",
                    "code",
                    "VS Code",
                    "HyprTrack - Visual Studio Code",
                ),
            )
            .unwrap();
        fs::create_dir_all(destination.parent().unwrap()).unwrap();
        fs::write(&destination, []).unwrap();

        assert_eq!(
            prepare_database(&destination, Some(&source)).unwrap(),
            MigrationResult::Imported { rows: 1 }
        );
    }
}

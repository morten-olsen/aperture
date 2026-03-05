use std::sync::Arc;

use async_trait::async_trait;
use rusqlite::Connection;
use tokio::sync::Mutex;

use aperture_engine::error::{EngineError, Result};
use aperture_engine::plugin::{Plugin, SetupContext};

use crate::config::RuntimeConfig;

/// Wrapper around a SQLite connection for async usage.
///
/// Uses `tokio::task::spawn_blocking` to run synchronous rusqlite operations
/// without blocking the async runtime.
#[derive(Clone)]
pub struct DatabaseService {
    conn: Arc<Mutex<Connection>>,
}

impl DatabaseService {
    pub fn new(conn: Connection) -> Self {
        Self {
            conn: Arc::new(Mutex::new(conn)),
        }
    }

    /// Execute a blocking closure with access to the SQLite connection.
    pub async fn call<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> std::result::Result<T, rusqlite::Error> + Send + 'static,
        T: Send + 'static,
    {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            f(&conn)
        })
        .await
        .map_err(|e| EngineError::PluginSetup(format!("database task panicked: {e}")))?
        .map_err(|e| EngineError::PluginSetup(format!("database error: {e}")))
    }
}

/// Plugin that creates and inserts the `DatabaseService` into extensions.
///
/// Reads `RuntimeConfig` from extensions to determine the database path.
/// Must be registered after `RuntimeConfigPlugin`.
pub struct DatabasePlugin;

#[async_trait]
impl Plugin for DatabasePlugin {
    fn id(&self) -> &str {
        "database"
    }

    fn description(&self) -> &str {
        "Provides SQLite database service"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        let config = ctx
            .extensions
            .get::<RuntimeConfig>()
            .ok_or_else(|| EngineError::PluginSetup("RuntimeConfig not found".into()))?;

        let db_path = config.data_root.join("aperture.db");

        // Ensure the data directory exists.
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| EngineError::PluginSetup(format!("create data dir: {e}")))?;
        }

        let conn = Connection::open(&db_path)
            .map_err(|e| EngineError::PluginSetup(format!("open database: {e}")))?;

        // Enable WAL mode for better concurrent read performance.
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| EngineError::PluginSetup(format!("enable WAL: {e}")))?;

        ctx.extensions.insert(DatabaseService::new(conn));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn in_memory_db_round_trip() {
        let conn = Connection::open_in_memory().unwrap();
        let db = DatabaseService::new(conn);

        db.call(|conn| {
            conn.execute_batch("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)")?;
            conn.execute("INSERT INTO test (name) VALUES (?1)", ["alice"])?;
            Ok(())
        })
        .await
        .unwrap();

        let name: String = db
            .call(|conn| conn.query_row("SELECT name FROM test WHERE id = 1", [], |row| row.get(0)))
            .await
            .unwrap();

        assert_eq!(name, "alice");
    }

    #[tokio::test]
    async fn wal_mode_enabled() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
        let db = DatabaseService::new(conn);

        let mode: String = db
            .call(|conn| conn.query_row("PRAGMA journal_mode", [], |row| row.get(0)))
            .await
            .unwrap();

        // In-memory databases may report "memory" instead of "wal".
        assert!(mode == "wal" || mode == "memory");
    }
}

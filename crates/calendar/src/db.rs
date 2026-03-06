use std::path::Path;
use std::sync::Arc;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::error::{CalendarError, Result};

/// Async wrapper around a SQLite connection for calendar data.
#[derive(Clone)]
pub struct CalendarDb {
    conn: Arc<Mutex<Connection>>,
}

impl CalendarDb {
    /// Open (or create) the calendar database for a user.
    pub fn open(data_root: &Path, user_id: &str) -> Result<Self> {
        let dir = data_root.join(user_id);
        std::fs::create_dir_all(&dir)
            .map_err(|e| CalendarError::Caldav(format!("create calendar dir: {e}")))?;
        let db_path = dir.join("calendar.db");
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        migrate(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Open an in-memory database (for tests).
    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        migrate(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Execute a blocking closure against the connection.
    pub async fn call<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T> + Send + 'static,
        T: Send + 'static,
    {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.blocking_lock();
            f(&conn)
        })
        .await
        .map_err(|e| CalendarError::Caldav(format!("task panicked: {e}")))?
    }
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS accounts (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            server_url  TEXT NOT NULL,
            email       TEXT NOT NULL,
            secret_id   TEXT NOT NULL,
            last_synced_at TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS calendars (
            id           TEXT PRIMARY KEY,
            account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            path         TEXT NOT NULL,
            display_name TEXT NOT NULL,
            color        TEXT,
            ctag         TEXT
        );

        CREATE TABLE IF NOT EXISTS events (
            id              TEXT PRIMARY KEY,
            calendar_id     TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
            uid             TEXT NOT NULL,
            etag            TEXT,
            summary         TEXT NOT NULL,
            description     TEXT,
            location        TEXT,
            start_at        TEXT NOT NULL,
            end_at          TEXT NOT NULL,
            all_day         INTEGER NOT NULL DEFAULT 0,
            recurrence_rule TEXT,
            raw_ical        TEXT,
            parent_event_id TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_events_range
            ON events(start_at, end_at);
        CREATE INDEX IF NOT EXISTS idx_events_calendar
            ON events(calendar_id);
        CREATE INDEX IF NOT EXISTS idx_calendars_account
            ON calendars(account_id);",
    )?;
    Ok(())
}

// ── Row types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountRow {
    pub id: String,
    pub user_id: String,
    pub server_url: String,
    pub email: String,
    pub secret_id: String,
    pub last_synced_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarRow {
    pub id: String,
    pub account_id: String,
    pub path: String,
    pub display_name: String,
    pub color: Option<String>,
    pub ctag: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRow {
    pub id: String,
    pub calendar_id: String,
    pub uid: String,
    pub etag: Option<String>,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start_at: String,
    pub end_at: String,
    pub all_day: bool,
    pub recurrence_rule: Option<String>,
    pub raw_ical: Option<String>,
    pub parent_event_id: Option<String>,
}

// ── CRUD functions ───────────────────────────────────────────────────

pub fn insert_account(conn: &Connection, row: &AccountRow) -> Result<()> {
    conn.execute(
        "INSERT INTO accounts (id, user_id, server_url, email, secret_id, last_synced_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            row.id,
            row.user_id,
            row.server_url,
            row.email,
            row.secret_id,
            row.last_synced_at,
            row.created_at,
        ],
    )?;
    Ok(())
}

pub fn get_account(conn: &Connection, id: &str) -> Result<Option<AccountRow>> {
    conn.query_row(
        "SELECT id, user_id, server_url, email, secret_id, last_synced_at, created_at
         FROM accounts WHERE id = ?1",
        params![id],
        |row| {
            Ok(AccountRow {
                id: row.get(0)?,
                user_id: row.get(1)?,
                server_url: row.get(2)?,
                email: row.get(3)?,
                secret_id: row.get(4)?,
                last_synced_at: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

pub fn list_accounts(conn: &Connection, user_id: &str) -> Result<Vec<AccountRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, server_url, email, secret_id, last_synced_at, created_at
         FROM accounts WHERE user_id = ?1 ORDER BY created_at",
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(AccountRow {
            id: row.get(0)?,
            user_id: row.get(1)?,
            server_url: row.get(2)?,
            email: row.get(3)?,
            secret_id: row.get(4)?,
            last_synced_at: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

pub fn delete_account(conn: &Connection, id: &str) -> Result<bool> {
    let count = conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(count > 0)
}

pub fn upsert_calendar(conn: &Connection, row: &CalendarRow) -> Result<()> {
    conn.execute(
        "INSERT INTO calendars (id, account_id, path, display_name, color, ctag)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            display_name = excluded.display_name,
            color = excluded.color,
            ctag = excluded.ctag",
        params![
            row.id,
            row.account_id,
            row.path,
            row.display_name,
            row.color,
            row.ctag,
        ],
    )?;
    Ok(())
}

pub fn list_calendars_for_account(conn: &Connection, account_id: &str) -> Result<Vec<CalendarRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, account_id, path, display_name, color, ctag
         FROM calendars WHERE account_id = ?1 ORDER BY display_name",
    )?;
    let rows = stmt.query_map(params![account_id], |row| {
        Ok(CalendarRow {
            id: row.get(0)?,
            account_id: row.get(1)?,
            path: row.get(2)?,
            display_name: row.get(3)?,
            color: row.get(4)?,
            ctag: row.get(5)?,
        })
    })?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

pub fn delete_events_for_calendar(conn: &Connection, calendar_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM events WHERE calendar_id = ?1",
        params![calendar_id],
    )?;
    Ok(())
}

pub fn upsert_event(conn: &Connection, row: &EventRow) -> Result<()> {
    conn.execute(
        "INSERT INTO events (id, calendar_id, uid, etag, summary, description, location,
                             start_at, end_at, all_day, recurrence_rule, raw_ical, parent_event_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(id) DO UPDATE SET
            etag = excluded.etag,
            summary = excluded.summary,
            description = excluded.description,
            location = excluded.location,
            start_at = excluded.start_at,
            end_at = excluded.end_at,
            all_day = excluded.all_day,
            recurrence_rule = excluded.recurrence_rule,
            raw_ical = excluded.raw_ical,
            parent_event_id = excluded.parent_event_id",
        params![
            row.id,
            row.calendar_id,
            row.uid,
            row.etag,
            row.summary,
            row.description,
            row.location,
            row.start_at,
            row.end_at,
            row.all_day,
            row.recurrence_rule,
            row.raw_ical,
            row.parent_event_id,
        ],
    )?;
    Ok(())
}

pub fn list_events_in_range(
    conn: &Connection,
    user_id: &str,
    from: &str,
    to: &str,
) -> Result<Vec<EventRow>> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.calendar_id, e.uid, e.etag, e.summary, e.description, e.location,
                e.start_at, e.end_at, e.all_day, e.recurrence_rule, e.raw_ical, e.parent_event_id
         FROM events e
         JOIN calendars c ON e.calendar_id = c.id
         JOIN accounts a ON c.account_id = a.id
         WHERE a.user_id = ?1
           AND e.end_at >= ?2
           AND e.start_at <= ?3
           AND (e.parent_event_id IS NOT NULL OR e.recurrence_rule IS NULL)
         ORDER BY e.start_at",
    )?;
    let rows = stmt.query_map(params![user_id, from, to], |row| {
        Ok(EventRow {
            id: row.get(0)?,
            calendar_id: row.get(1)?,
            uid: row.get(2)?,
            etag: row.get(3)?,
            summary: row.get(4)?,
            description: row.get(5)?,
            location: row.get(6)?,
            start_at: row.get(7)?,
            end_at: row.get(8)?,
            all_day: row.get(9)?,
            recurrence_rule: row.get(10)?,
            raw_ical: row.get(11)?,
            parent_event_id: row.get(12)?,
        })
    })?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(Into::into)
}

pub fn update_account_synced(conn: &Connection, account_id: &str, at: &str) -> Result<()> {
    conn.execute(
        "UPDATE accounts SET last_synced_at = ?1 WHERE id = ?2",
        params![at, account_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_creates_tables() {
        let db = CalendarDb::open_in_memory().unwrap();
        let conn = db.conn.blocking_lock();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('accounts','calendars','events')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn account_crud() {
        let db = CalendarDb::open_in_memory().unwrap();
        let conn = db.conn.blocking_lock();

        let acct = AccountRow {
            id: "acct1".into(),
            user_id: "alice".into(),
            server_url: "https://cal.example.com".into(),
            email: "alice@example.com".into(),
            secret_id: "s1".into(),
            last_synced_at: None,
            created_at: "2025-01-01T00:00:00Z".into(),
        };
        insert_account(&conn, &acct).unwrap();

        let fetched = get_account(&conn, "acct1").unwrap().unwrap();
        assert_eq!(fetched.email, "alice@example.com");

        let list = list_accounts(&conn, "alice").unwrap();
        assert_eq!(list.len(), 1);

        assert!(delete_account(&conn, "acct1").unwrap());
        assert!(!delete_account(&conn, "acct1").unwrap());
    }

    #[test]
    fn calendar_upsert_and_list() {
        let db = CalendarDb::open_in_memory().unwrap();
        let conn = db.conn.blocking_lock();

        let acct = AccountRow {
            id: "a1".into(),
            user_id: "alice".into(),
            server_url: "https://cal.example.com".into(),
            email: "a@b.c".into(),
            secret_id: "s1".into(),
            last_synced_at: None,
            created_at: "2025-01-01T00:00:00Z".into(),
        };
        insert_account(&conn, &acct).unwrap();

        let cal = CalendarRow {
            id: "c1".into(),
            account_id: "a1".into(),
            path: "/cal/personal/".into(),
            display_name: "Personal".into(),
            color: Some("#ff0000".into()),
            ctag: Some("tag1".into()),
        };
        upsert_calendar(&conn, &cal).unwrap();

        let cals = list_calendars_for_account(&conn, "a1").unwrap();
        assert_eq!(cals.len(), 1);
        assert_eq!(cals[0].display_name, "Personal");

        // Upsert updates
        let updated_cal = CalendarRow {
            display_name: "Personal Calendar".into(),
            ctag: Some("tag2".into()),
            ..cal
        };
        upsert_calendar(&conn, &updated_cal).unwrap();
        let cals = list_calendars_for_account(&conn, "a1").unwrap();
        assert_eq!(cals[0].display_name, "Personal Calendar");
    }

    #[test]
    fn event_upsert_and_range_query() {
        let db = CalendarDb::open_in_memory().unwrap();
        let conn = db.conn.blocking_lock();

        insert_account(
            &conn,
            &AccountRow {
                id: "a1".into(),
                user_id: "alice".into(),
                server_url: "https://cal.example.com".into(),
                email: "a@b.c".into(),
                secret_id: "s1".into(),
                last_synced_at: None,
                created_at: "2025-01-01T00:00:00Z".into(),
            },
        )
        .unwrap();
        upsert_calendar(
            &conn,
            &CalendarRow {
                id: "c1".into(),
                account_id: "a1".into(),
                path: "/cal/".into(),
                display_name: "Cal".into(),
                color: None,
                ctag: None,
            },
        )
        .unwrap();

        let ev = EventRow {
            id: "e1".into(),
            calendar_id: "c1".into(),
            uid: "uid1".into(),
            etag: Some("etag1".into()),
            summary: "Meeting".into(),
            description: None,
            location: None,
            start_at: "2025-06-15T10:00:00Z".into(),
            end_at: "2025-06-15T11:00:00Z".into(),
            all_day: false,
            recurrence_rule: None,
            raw_ical: None,
            parent_event_id: None,
        };
        upsert_event(&conn, &ev).unwrap();

        let events = list_events_in_range(
            &conn,
            "alice",
            "2025-06-01T00:00:00Z",
            "2025-06-30T23:59:59Z",
        )
        .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].summary, "Meeting");

        // Out of range
        let events = list_events_in_range(
            &conn,
            "alice",
            "2025-07-01T00:00:00Z",
            "2025-07-31T23:59:59Z",
        )
        .unwrap();
        assert!(events.is_empty());
    }

    #[test]
    fn cascade_deletes_calendars_and_events() {
        let db = CalendarDb::open_in_memory().unwrap();
        let conn = db.conn.blocking_lock();

        insert_account(
            &conn,
            &AccountRow {
                id: "a1".into(),
                user_id: "alice".into(),
                server_url: "https://cal.example.com".into(),
                email: "a@b.c".into(),
                secret_id: "s1".into(),
                last_synced_at: None,
                created_at: "2025-01-01T00:00:00Z".into(),
            },
        )
        .unwrap();
        upsert_calendar(
            &conn,
            &CalendarRow {
                id: "c1".into(),
                account_id: "a1".into(),
                path: "/cal/".into(),
                display_name: "Cal".into(),
                color: None,
                ctag: None,
            },
        )
        .unwrap();
        upsert_event(
            &conn,
            &EventRow {
                id: "e1".into(),
                calendar_id: "c1".into(),
                uid: "uid1".into(),
                etag: None,
                summary: "Test".into(),
                description: None,
                location: None,
                start_at: "2025-06-15T10:00:00Z".into(),
                end_at: "2025-06-15T11:00:00Z".into(),
                all_day: false,
                recurrence_rule: None,
                raw_ical: None,
                parent_event_id: None,
            },
        )
        .unwrap();

        delete_account(&conn, "a1").unwrap();

        let cals = list_calendars_for_account(&conn, "a1").unwrap();
        assert!(cals.is_empty());

        let events = list_events_in_range(
            &conn,
            "alice",
            "2025-01-01T00:00:00Z",
            "2025-12-31T23:59:59Z",
        )
        .unwrap();
        assert!(events.is_empty());
    }
}

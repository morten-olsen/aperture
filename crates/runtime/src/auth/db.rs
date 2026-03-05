use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// Run schema migrations for the users table.
pub fn migrate(conn: &Connection) -> std::result::Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        ",
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRow {
    pub id: String,
    pub username: String,
    pub password_hash: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn create_user(
    conn: &Connection,
    id: &str,
    username: &str,
    password_hash: Option<&str>,
) -> std::result::Result<UserRow, rusqlite::Error> {
    conn.execute(
        "INSERT INTO users (id, username, password_hash) VALUES (?1, ?2, ?3)",
        params![id, username, password_hash],
    )?;
    get_user_by_id(conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn get_user_by_id(
    conn: &Connection,
    id: &str,
) -> std::result::Result<Option<UserRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, username, password_hash, created_at, updated_at FROM users WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], row_to_user)?;
    rows.next().transpose()
}

pub fn get_user_by_username(
    conn: &Connection,
    username: &str,
) -> std::result::Result<Option<UserRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, username, password_hash, created_at, updated_at FROM users WHERE username = ?1",
    )?;
    let mut rows = stmt.query_map(params![username], row_to_user)?;
    rows.next().transpose()
}

pub fn list_users(conn: &Connection) -> std::result::Result<Vec<UserRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, username, password_hash, created_at, updated_at FROM users ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], row_to_user)?;
    rows.collect()
}

pub fn delete_user(conn: &Connection, id: &str) -> std::result::Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM users WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_password(
    conn: &Connection,
    id: &str,
    password_hash: &str,
) -> std::result::Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![password_hash, id],
    )?;
    Ok(())
}

fn row_to_user(row: &rusqlite::Row<'_>) -> std::result::Result<UserRow, rusqlite::Error> {
    Ok(UserRow {
        id: row.get(0)?,
        username: row.get(1)?,
        password_hash: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn migration_creates_table() {
        let conn = setup_db();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn create_and_get_user() {
        let conn = setup_db();
        let user = create_user(&conn, "u1", "alice", Some("hash123")).unwrap();
        assert_eq!(user.username, "alice");
        assert_eq!(user.password_hash.as_deref(), Some("hash123"));

        let fetched = get_user_by_id(&conn, "u1").unwrap().unwrap();
        assert_eq!(fetched.username, "alice");

        let by_name = get_user_by_username(&conn, "alice").unwrap().unwrap();
        assert_eq!(by_name.id, "u1");
    }

    #[test]
    fn list_and_delete_users() {
        let conn = setup_db();
        create_user(&conn, "u1", "alice", None).unwrap();
        create_user(&conn, "u2", "bob", None).unwrap();

        let users = list_users(&conn).unwrap();
        assert_eq!(users.len(), 2);

        delete_user(&conn, "u1").unwrap();
        let users = list_users(&conn).unwrap();
        assert_eq!(users.len(), 1);
        assert_eq!(users[0].username, "bob");
    }

    #[test]
    fn set_password_updates_hash() {
        let conn = setup_db();
        create_user(&conn, "u1", "alice", None).unwrap();

        let user = get_user_by_id(&conn, "u1").unwrap().unwrap();
        assert!(user.password_hash.is_none());

        set_password(&conn, "u1", "new_hash").unwrap();
        let user = get_user_by_id(&conn, "u1").unwrap().unwrap();
        assert_eq!(user.password_hash.as_deref(), Some("new_hash"));
    }

    #[test]
    fn duplicate_username_fails() {
        let conn = setup_db();
        create_user(&conn, "u1", "alice", None).unwrap();
        let result = create_user(&conn, "u2", "alice", None);
        assert!(result.is_err());
    }
}

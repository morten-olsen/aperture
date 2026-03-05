use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use aperture_engine::prompt::{Prompt, PromptOutput, PromptState, PromptUsage};

/// Run schema migrations for conversation tables.
pub fn migrate(conn: &Connection) -> std::result::Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT,
            description TEXT,
            summary TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS prompts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            state TEXT NOT NULL,
            input TEXT,
            output TEXT NOT NULL DEFAULT '[]',
            usage TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS conversation_prompts (
            conversation_id TEXT NOT NULL,
            prompt_id TEXT NOT NULL,
            PRIMARY KEY (conversation_id, prompt_id)
        );

        CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
        CREATE INDEX IF NOT EXISTS idx_conversation_prompts_conversation_id ON conversation_prompts(conversation_id);
        ",
    )
}

/// Upsert a prompt row.
pub fn upsert_prompt(
    conn: &Connection,
    id: &str,
    user_id: &str,
    state: &str,
    input: Option<&str>,
    output_json: &str,
    usage_json: &str,
) -> std::result::Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO prompts (id, user_id, state, input, output, usage)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
             state = excluded.state,
             output = excluded.output,
             usage = excluded.usage,
             updated_at = datetime('now')",
        params![id, user_id, state, input, output_json, usage_json],
    )?;
    Ok(())
}

/// Insert a new conversation row.
pub fn create_conversation(
    conn: &Connection,
    id: &str,
    user_id: &str,
    title: Option<&str>,
    description: Option<&str>,
) -> std::result::Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO conversations (id, user_id, title, description)
         VALUES (?1, ?2, ?3, ?4)",
        params![id, user_id, title, description],
    )?;
    Ok(())
}

/// Attach a prompt to a conversation.
pub fn attach_prompt(
    conn: &Connection,
    conversation_id: &str,
    prompt_id: &str,
) -> std::result::Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR IGNORE INTO conversation_prompts (conversation_id, prompt_id)
         VALUES (?1, ?2)",
        params![conversation_id, prompt_id],
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationRow {
    pub id: String,
    pub user_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub summary: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptRow {
    pub id: String,
    pub user_id: String,
    pub state: String,
    pub input: Option<String>,
    pub output: String,
    pub usage: String,
    pub created_at: String,
    pub updated_at: String,
}

/// List conversations for a user.
pub fn list_conversations(
    conn: &Connection,
    user_id: &str,
) -> std::result::Result<Vec<ConversationRow>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, user_id, title, description, summary, created_at, updated_at
         FROM conversations WHERE user_id = ?1 ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map(params![user_id], |row| {
        Ok(ConversationRow {
            id: row.get(0)?,
            user_id: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            summary: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

/// Get a conversation and its prompts.
pub fn get_conversation_with_prompts(
    conn: &Connection,
    conversation_id: &str,
) -> std::result::Result<(ConversationRow, Vec<PromptRow>), rusqlite::Error> {
    let conv = conn.query_row(
        "SELECT id, user_id, title, description, summary, created_at, updated_at
         FROM conversations WHERE id = ?1",
        params![conversation_id],
        |row| {
            Ok(ConversationRow {
                id: row.get(0)?,
                user_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                summary: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )?;

    let mut stmt = conn.prepare(
        "SELECT p.id, p.user_id, p.state, p.input, p.output, p.usage, p.created_at, p.updated_at
         FROM prompts p
         INNER JOIN conversation_prompts cp ON cp.prompt_id = p.id
         WHERE cp.conversation_id = ?1
         ORDER BY p.created_at ASC",
    )?;
    let rows = stmt.query_map(params![conversation_id], |row| {
        Ok(PromptRow {
            id: row.get(0)?,
            user_id: row.get(1)?,
            state: row.get(2)?,
            input: row.get(3)?,
            output: row.get(4)?,
            usage: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    let prompts: std::result::Result<Vec<_>, _> = rows.collect();

    Ok((conv, prompts?))
}

/// Convert a PromptRow back into an engine Prompt.
pub fn row_to_prompt(row: &PromptRow) -> std::result::Result<Prompt, serde_json::Error> {
    let state = match row.state.as_str() {
        "running" => PromptState::Running,
        "completed" => PromptState::Completed,
        "waiting_for_approval" => PromptState::WaitingForApproval,
        _ => PromptState::Running,
    };
    let output: Vec<PromptOutput> = serde_json::from_str(&row.output)?;
    let usage: PromptUsage = serde_json::from_str(&row.usage)?;

    Ok(Prompt {
        id: row.id.clone(),
        user_id: row.user_id.clone(),
        state,
        input: row.input.clone(),
        output,
        usage,
    })
}

/// Serialize a PromptState to the string used in the DB.
pub fn state_to_str(state: &PromptState) -> &'static str {
    match state {
        PromptState::Running => "running",
        PromptState::Completed => "completed",
        PromptState::WaitingForApproval => "waiting_for_approval",
    }
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
    fn migration_creates_tables() {
        let conn = setup_db();
        // Verify tables exist by querying them.
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM conversations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM prompts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn upsert_prompt_round_trip() {
        let conn = setup_db();

        upsert_prompt(
            &conn,
            "p1",
            "user-1",
            "running",
            Some("hello"),
            "[]",
            "{}",
        )
        .unwrap();

        // Update the same prompt.
        upsert_prompt(
            &conn,
            "p1",
            "user-1",
            "completed",
            Some("hello"),
            "[{\"type\":\"text\",\"content\":\"hi\"}]",
            "{\"prompt_tokens\":10,\"completion_tokens\":5,\"total_tokens\":15}",
        )
        .unwrap();

        let state: String = conn
            .query_row("SELECT state FROM prompts WHERE id = 'p1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(state, "completed");
    }

    #[test]
    fn conversation_crud() {
        let conn = setup_db();

        create_conversation(&conn, "c1", "user-1", Some("Test Chat"), None).unwrap();

        upsert_prompt(
            &conn,
            "p1",
            "user-1",
            "completed",
            Some("hello"),
            "[]",
            "{}",
        )
        .unwrap();
        attach_prompt(&conn, "c1", "p1").unwrap();

        let convs = list_conversations(&conn, "user-1").unwrap();
        assert_eq!(convs.len(), 1);
        assert_eq!(convs[0].title.as_deref(), Some("Test Chat"));

        let (conv, prompts) = get_conversation_with_prompts(&conn, "c1").unwrap();
        assert_eq!(conv.id, "c1");
        assert_eq!(prompts.len(), 1);
        assert_eq!(prompts[0].id, "p1");
    }

    #[test]
    fn row_to_prompt_conversion() {
        let row = PromptRow {
            id: "p1".into(),
            user_id: "user-1".into(),
            state: "completed".into(),
            input: Some("hello".into()),
            output: "[{\"type\":\"text\",\"content\":\"hi\"}]".into(),
            usage: "{\"prompt_tokens\":10,\"completion_tokens\":5,\"total_tokens\":15}".into(),
            created_at: "2024-01-01".into(),
            updated_at: "2024-01-01".into(),
        };

        let prompt = row_to_prompt(&row).unwrap();
        assert_eq!(prompt.id, "p1");
        assert_eq!(prompt.state, PromptState::Completed);
        assert_eq!(prompt.output.len(), 1);
        assert_eq!(prompt.usage.total_tokens, 15);
    }
}

use std::path::{Path, PathBuf};

use async_trait::async_trait;
use chrono::{Duration, NaiveDate, NaiveDateTime, Utc};
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::secret::PluginSecretStoreService;
use aperture_engine::tool::{ToolContext, ToolInvoke};

use crate::caldav::CaldavClient;
use crate::db::{self, AccountRow, CalendarDb, CalendarRow};
use crate::error::CalendarError;
use crate::ical;

fn get_secret_store<'a>(ctx: &'a ToolContext<'_>) -> Result<&'a PluginSecretStoreService> {
    ctx.extensions
        .get::<PluginSecretStoreService>()
        .ok_or_else(|| EngineError::ToolInvocation("secret store unavailable".into()))
}

fn open_db(data_root: &Path, user_id: &str) -> Result<CalendarDb> {
    CalendarDb::open(data_root, user_id).map_err(|e| EngineError::ToolInvocation(e.to_string()))
}

// ── calendar_setup ───────────────────────────────────────────────────

pub struct CalendarSetup {
    pub data_root: PathBuf,
}

#[async_trait]
impl ToolInvoke for CalendarSetup {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let server_url = ctx.input["server_url"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("server_url required".into()))?
            .to_string();
        let email = ctx.input["email"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("email required".into()))?
            .to_string();
        let password = ctx.input["password"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("password required".into()))?
            .to_string();

        let secrets = get_secret_store(&ctx)?;
        let account_id = uuid::Uuid::new_v4().to_string();
        let secret_id = format!("calendar_{account_id}");

        // Test connection by discovering calendars
        let client = CaldavClient::new(server_url.clone(), email.clone(), password.clone());
        let discovered = client
            .discover_calendars()
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("CalDAV connection failed: {e}")))?;

        // Store password
        secrets.0.add_plugin_secret(
            &ctx.user_id,
            &secret_id,
            &format!("Calendar: {email}"),
            &password,
        )?;

        // Insert account and calendars
        let db = open_db(&self.data_root, &ctx.user_id)?;
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let account = AccountRow {
            id: account_id.clone(),
            user_id: ctx.user_id.clone(),
            server_url,
            email: email.clone(),
            secret_id,
            last_synced_at: None,
            created_at: now,
        };

        let calendars_found = discovered.len();
        db.call(move |conn| {
            db::insert_account(conn, &account)?;
            for cal in &discovered {
                let cal_id = uuid::Uuid::new_v4().to_string();
                db::upsert_calendar(
                    conn,
                    &CalendarRow {
                        id: cal_id,
                        account_id: account_id.clone(),
                        path: cal.path.clone(),
                        display_name: cal.display_name.clone(),
                        color: cal.color.clone(),
                        ctag: cal.ctag.clone(),
                    },
                )?;
            }
            Ok(())
        })
        .await
        .map_err(|e| EngineError::ToolInvocation(e.to_string()))?;

        Ok(json!({
            "status": "ok",
            "email": email,
            "calendars_found": calendars_found
        }))
    }
}

// ── calendar_remove ──────────────────────────────────────────────────

pub struct CalendarRemove {
    pub data_root: PathBuf,
}

#[async_trait]
impl ToolInvoke for CalendarRemove {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let account_id = ctx.input["account_id"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("account_id required".into()))?
            .to_string();

        let db = open_db(&self.data_root, &ctx.user_id)?;
        let aid = account_id.clone();
        let account = db
            .call(move |conn| db::get_account(conn, &aid))
            .await
            .map_err(|e| EngineError::ToolInvocation(e.to_string()))?
            .ok_or_else(|| {
                EngineError::ToolInvocation(format!("account not found: {account_id}"))
            })?;

        // Remove secret
        let secrets = get_secret_store(&ctx)?;
        let _ = secrets
            .0
            .remove_plugin_secret(&ctx.user_id, &account.secret_id);

        // Delete account (cascades to calendars and events)
        let aid2 = account_id.clone();
        db.call(move |conn| {
            db::delete_account(conn, &aid2)?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::ToolInvocation(e.to_string()))?;

        Ok(json!({ "status": "ok", "removed": account_id }))
    }
}

// ── calendar_sync ────────────────────────────────────────────────────

pub struct CalendarSync {
    pub data_root: PathBuf,
}

#[async_trait]
impl ToolInvoke for CalendarSync {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let secrets = get_secret_store(&ctx)?;
        let db = open_db(&self.data_root, &ctx.user_id)?;

        let user_id = ctx.user_id.clone();
        let accounts = db
            .call(move |conn| db::list_accounts(conn, &user_id))
            .await
            .map_err(|e| EngineError::ToolInvocation(e.to_string()))?;

        let now = Utc::now().naive_utc();
        let from = now - Duration::days(30);
        let to = now + Duration::days(90);
        let from_str = from.format("%Y%m%dT%H%M%SZ").to_string();
        let to_str = to.format("%Y%m%dT%H%M%SZ").to_string();

        let mut synced_count = 0usize;
        let mut error_count = 0usize;

        for account in &accounts {
            let password = match secrets
                .0
                .get_plugin_secret(&ctx.user_id, &account.secret_id)
            {
                Ok(pw) => pw,
                Err(_) => {
                    error_count += 1;
                    continue;
                }
            };

            let client =
                CaldavClient::new(account.server_url.clone(), account.email.clone(), password);

            match sync_account(&db, &client, account, &from_str, &to_str, to).await {
                Ok(n) => synced_count += n,
                Err(_) => error_count += 1,
            }

            // Update last_synced_at
            let aid = account.id.clone();
            let now_str = Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
            let _ = db
                .call(move |conn| db::update_account_synced(conn, &aid, &now_str))
                .await;
        }

        Ok(json!({
            "status": "ok",
            "accounts": accounts.len(),
            "events_synced": synced_count,
            "errors": error_count
        }))
    }
}

async fn sync_account(
    db: &CalendarDb,
    client: &CaldavClient,
    account: &AccountRow,
    from: &str,
    to: &str,
    until: NaiveDateTime,
) -> std::result::Result<usize, CalendarError> {
    let discovered = client.discover_calendars().await?;

    let account_id = account.id.clone();
    let discovered_clone = discovered.clone();
    db.call(move |conn| {
        for cal in &discovered_clone {
            let cal_id = format!("{}_{}", account_id, sanitize_path(&cal.path));
            db::upsert_calendar(
                conn,
                &CalendarRow {
                    id: cal_id,
                    account_id: account_id.clone(),
                    path: cal.path.clone(),
                    display_name: cal.display_name.clone(),
                    color: cal.color.clone(),
                    ctag: cal.ctag.clone(),
                },
            )?;
        }
        Ok(())
    })
    .await?;

    let mut total_events = 0usize;

    for cal in &discovered {
        let cal_id = format!("{}_{}", account.id, sanitize_path(&cal.path));
        let fetched = client.fetch_events(&cal.path, from, to).await?;

        let cid = cal_id.clone();
        db.call(move |conn| db::delete_events_for_calendar(conn, &cid))
            .await?;

        for fe in &fetched {
            let parsed_events = match ical::parse_ical(&fe.ical_data) {
                Ok(events) => events,
                Err(_) => continue,
            };

            for parsed in &parsed_events {
                let rows = ical::expand_to_rows(
                    parsed,
                    &cal_id,
                    fe.etag.as_deref(),
                    Some(&fe.ical_data),
                    until,
                );
                total_events += rows.len();
                let rows_clone = rows;
                db.call(move |conn| {
                    for row in &rows_clone {
                        db::upsert_event(conn, row)?;
                    }
                    Ok(())
                })
                .await?;
            }
        }
    }

    Ok(total_events)
}

fn sanitize_path(path: &str) -> String {
    path.replace('/', "_").trim_matches('_').to_string()
}

// ── calendar_list ────────────────────────────────────────────────────

pub struct CalendarList {
    pub data_root: PathBuf,
}

#[async_trait]
impl ToolInvoke for CalendarList {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let db = open_db(&self.data_root, &ctx.user_id)?;

        let user_id = ctx.user_id.clone();
        let accounts = db
            .call(move |conn| db::list_accounts(conn, &user_id))
            .await
            .map_err(|e| EngineError::ToolInvocation(e.to_string()))?;

        let mut result = Vec::new();
        for account in &accounts {
            let aid = account.id.clone();
            let calendars = db
                .call(move |conn| db::list_calendars_for_account(conn, &aid))
                .await
                .map_err(|e| EngineError::ToolInvocation(e.to_string()))?;

            result.push(json!({
                "id": account.id,
                "email": account.email,
                "server_url": account.server_url,
                "last_synced_at": account.last_synced_at,
                "calendars": calendars.iter().map(|c| json!({
                    "id": c.id,
                    "display_name": c.display_name,
                    "color": c.color,
                })).collect::<Vec<_>>()
            }));
        }

        Ok(json!({ "accounts": result }))
    }
}

// ── calendar_list_events ─────────────────────────────────────────────

pub struct CalendarListEvents {
    pub data_root: PathBuf,
}

#[async_trait]
impl ToolInvoke for CalendarListEvents {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let from_str = ctx.input["from"].as_str().unwrap_or("");
        let duration_days = ctx.input["duration_days"].as_u64().unwrap_or(7) as i64;

        let from_date = if from_str.is_empty() {
            Utc::now().naive_utc().date()
        } else {
            NaiveDate::parse_from_str(from_str, "%Y-%m-%d")
                .map_err(|e| EngineError::ToolInvocation(format!("invalid from date: {e}")))?
        };

        let to_date = from_date + Duration::days(duration_days);
        let from_dt = from_date
            .and_hms_opt(0, 0, 0)
            .unwrap_or_default()
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string();
        let to_dt = to_date
            .and_hms_opt(23, 59, 59)
            .unwrap_or_default()
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string();

        let db = open_db(&self.data_root, &ctx.user_id)?;
        let user_id = ctx.user_id.clone();
        let events = db
            .call(move |conn| db::list_events_in_range(conn, &user_id, &from_dt, &to_dt))
            .await
            .map_err(|e| EngineError::ToolInvocation(e.to_string()))?;

        let event_list: Vec<Value> = events
            .iter()
            .map(|e| {
                json!({
                    "id": e.id,
                    "summary": e.summary,
                    "start": e.start_at,
                    "end": e.end_at,
                    "all_day": e.all_day,
                    "location": e.location,
                    "description": e.description,
                    "calendar_id": e.calendar_id,
                })
            })
            .collect();

        Ok(json!({
            "from": from_date.to_string(),
            "to": to_date.to_string(),
            "events": event_list
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::state::State;

    fn make_ctx<'a>(
        input: Value,
        state: &'a mut State,
        ext: &'a Extensions,
        events: &'a EventBus,
    ) -> ToolContext<'a> {
        ToolContext {
            input,
            state,
            extensions: ext,
            events,
            user_id: "testuser".into(),
            replay: None,
        }
    }

    #[tokio::test]
    async fn list_returns_empty_without_accounts() {
        let dir = std::env::temp_dir().join(format!("aperture-cal-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let tool = CalendarList {
            data_root: dir.clone(),
        };
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({}), &mut state, &ext, &events);
        let result = tool.invoke(ctx).await.unwrap();
        assert!(result["accounts"].as_array().unwrap().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn list_events_returns_empty() {
        let dir = std::env::temp_dir().join(format!("aperture-cal-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();

        let tool = CalendarListEvents {
            data_root: dir.clone(),
        };
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({}), &mut state, &ext, &events);
        let result = tool.invoke(ctx).await.unwrap();
        assert!(result["events"].as_array().unwrap().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }
}

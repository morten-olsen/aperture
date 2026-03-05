use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::error::Result;
use aperture_engine::tool::{ToolContext, ToolInvoke};

// ── calendar_setup ────────────────────────────────────────────────

pub struct CalendarSetup;

#[async_trait]
impl ToolInvoke for CalendarSetup {
    async fn invoke(&self, _ctx: ToolContext<'_>) -> Result<Value> {
        Ok(json!({ "status": "ok", "message": "calendar account configured (stub)" }))
    }
}

// ── calendar_list ─────────────────────────────────────────────────

pub struct CalendarList;

#[async_trait]
impl ToolInvoke for CalendarList {
    async fn invoke(&self, _ctx: ToolContext<'_>) -> Result<Value> {
        Ok(json!({ "calendars": [] }))
    }
}

// ── calendar_list_events ──────────────────────────────────────────

pub struct CalendarListEvents;

#[async_trait]
impl ToolInvoke for CalendarListEvents {
    async fn invoke(&self, _ctx: ToolContext<'_>) -> Result<Value> {
        Ok(json!({ "events": [] }))
    }
}

// ── calendar_update ───────────────────────────────────────────────

pub struct CalendarUpdate;

#[async_trait]
impl ToolInvoke for CalendarUpdate {
    async fn invoke(&self, _ctx: ToolContext<'_>) -> Result<Value> {
        Ok(json!({ "status": "ok", "message": "event updated (stub)" }))
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
    async fn setup_returns_ok() {
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(
            json!({"id": "work", "email": "a@b.c", "password": "pw", "server_url": "https://cal.example.com"}),
            &mut state,
            &ext,
            &events,
        );
        let result = CalendarSetup.invoke(ctx).await.unwrap();
        assert_eq!(result["status"], "ok");
    }

    #[tokio::test]
    async fn list_returns_empty() {
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({}), &mut state, &ext, &events);
        let result = CalendarList.invoke(ctx).await.unwrap();
        assert!(result["calendars"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn list_events_returns_empty() {
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({"calendar_id": "c1"}), &mut state, &ext, &events);
        let result = CalendarListEvents.invoke(ctx).await.unwrap();
        assert!(result["events"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn update_returns_ok() {
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(
            json!({"calendar_id": "c1", "event_id": "e1", "title": "New Title"}),
            &mut state,
            &ext,
            &events,
        );
        let result = CalendarUpdate.invoke(ctx).await.unwrap();
        assert_eq!(result["status"], "ok");
    }
}

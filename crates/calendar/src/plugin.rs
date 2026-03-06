use std::path::PathBuf;
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;

use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext, SetupContext};
use aperture_engine::tool::{ApprovalRequirement, Tool};

use crate::tools::{CalendarList, CalendarListEvents, CalendarRemove, CalendarSetup, CalendarSync};

const TOOL_IDS: &[&str] = &[
    "calendar_setup",
    "calendar_remove",
    "calendar_sync",
    "calendar_list",
    "calendar_list_events",
];

pub struct CalendarPlugin {
    data_root: PathBuf,
}

impl CalendarPlugin {
    pub fn new(data_root: PathBuf) -> Self {
        Self { data_root }
    }
}

#[async_trait]
impl Plugin for CalendarPlugin {
    fn id(&self) -> &str {
        "calendar"
    }

    fn description(&self) -> &str {
        "CalDAV calendar integration"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        ctx.registry.register(Tool {
            id: "calendar_setup".into(),
            description: "Configure a CalDAV calendar account. Stores credentials securely and performs initial calendar discovery.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "server_url": { "type": "string", "description": "CalDAV server URL (e.g. https://caldav.fastmail.com/dav/)" },
                    "email": { "type": "string", "description": "Account email / username" },
                    "password": { "type": "string", "description": "App password or authentication token" }
                },
                "required": ["server_url", "email", "password"]
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Storing calendar credentials".into(),
            }),
            invoke: Arc::new(CalendarSetup { data_root: self.data_root.clone() }),
        });

        ctx.registry.register(Tool {
            id: "calendar_remove".into(),
            description: "Remove a CalDAV calendar account and all its cached data.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "account_id": { "type": "string", "description": "Account ID to remove" }
                },
                "required": ["account_id"]
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Removing calendar account".into(),
            }),
            invoke: Arc::new(CalendarRemove {
                data_root: self.data_root.clone(),
            }),
        });

        ctx.registry.register(Tool {
            id: "calendar_sync".into(),
            description: "Sync all calendar accounts — discovers calendars and fetches events (30 days back, 90 days forward).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(CalendarSync { data_root: self.data_root.clone() }),
        });

        ctx.registry.register(Tool {
            id: "calendar_list".into(),
            description: "List all configured calendar accounts and their calendars.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(CalendarList {
                data_root: self.data_root.clone(),
            }),
        });

        ctx.registry.register(Tool {
            id: "calendar_list_events".into(),
            description: "List calendar events in a time range.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "from": { "type": "string", "description": "Start date (ISO 8601, default: today)" },
                    "duration_days": { "type": "integer", "description": "Number of days to include (default: 7)" }
                }
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(CalendarListEvents { data_root: self.data_root.clone() }),
        });

        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        for id in TOOL_IDS {
            ctx.activate_tool(id)?;
        }
        Ok(())
    }
}

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;

use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext, SetupContext};
use aperture_engine::tool::Tool;

use crate::tools::{CalendarList, CalendarListEvents, CalendarSetup, CalendarUpdate};

pub struct CalendarPlugin;

const CALENDAR_TOOL_IDS: &[&str] = &[
    "calendar_setup",
    "calendar_list",
    "calendar_list_events",
    "calendar_update",
];

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
            description: "Configure a CalDAV calendar account.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Account identifier" },
                    "email": { "type": "string", "description": "Account email" },
                    "password": { "type": "string", "description": "App password or token" },
                    "server_url": { "type": "string", "description": "CalDAV server URL" }
                },
                "required": ["id", "email", "password", "server_url"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(CalendarSetup),
        });

        ctx.registry.register(Tool {
            id: "calendar_list".into(),
            description: "List available calendars.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(CalendarList),
        });

        ctx.registry.register(Tool {
            id: "calendar_list_events".into(),
            description: "List events in a calendar.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "calendar_id": { "type": "string", "description": "Calendar ID" },
                    "from": { "type": "string", "description": "Start date (ISO 8601)" },
                    "to": { "type": "string", "description": "End date (ISO 8601)" }
                },
                "required": ["calendar_id"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(CalendarListEvents),
        });

        ctx.registry.register(Tool {
            id: "calendar_update".into(),
            description: "Update a calendar event.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "calendar_id": { "type": "string", "description": "Calendar ID" },
                    "event_id": { "type": "string", "description": "Event ID" },
                    "title": { "type": "string", "description": "New title" },
                    "start": { "type": "string", "description": "New start time (ISO 8601)" },
                    "end": { "type": "string", "description": "New end time (ISO 8601)" }
                },
                "required": ["calendar_id", "event_id"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(CalendarUpdate),
        });

        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        for id in CALENDAR_TOOL_IDS {
            ctx.activate_tool(id)?;
        }
        Ok(())
    }
}

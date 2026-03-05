use async_trait::async_trait;
use serde_json::Value;

use aperture_engine::error::{EngineError, Result};
use aperture_engine::sandbox::ToolDescriptor;
use aperture_engine::tool::{ToolContext, ToolInvoke};

pub struct InspectToolInvoke {
    pub descriptors: Vec<ToolDescriptor>,
}

#[async_trait]
impl ToolInvoke for InspectToolInvoke {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let tool_id = ctx
            .input
            .get("tool_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: tool_id".into()))?;

        let descriptor = self
            .descriptors
            .iter()
            .find(|d| d.id == tool_id)
            .ok_or_else(|| EngineError::ToolNotFound(tool_id.to_string()))?;

        serde_json::to_value(descriptor).map_err(EngineError::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::state::State;
    use serde_json::json;

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
            user_id: "test".to_string(),
            replay: None,
        }
    }

    #[tokio::test]
    async fn returns_descriptor_for_known_tool() {
        let invoke = InspectToolInvoke {
            descriptors: vec![ToolDescriptor {
                id: "read_file".into(),
                description: "Read a file".into(),
                input_schema: json!({"type": "object", "properties": {"path": {"type": "string"}}}),
                output_schema: Some(json!({"type": "string"})),
            }],
        };

        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({"tool_id": "read_file"}), &mut state, &ext, &events);

        let result = invoke.invoke(ctx).await.unwrap();
        assert_eq!(result["id"], "read_file");
        assert_eq!(result["description"], "Read a file");
        assert!(result["input_schema"].is_object());
    }

    #[tokio::test]
    async fn returns_error_for_unknown_tool() {
        let invoke = InspectToolInvoke {
            descriptors: vec![],
        };

        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({"tool_id": "nonexistent"}), &mut state, &ext, &events);

        let err = invoke.invoke(ctx).await.unwrap_err();
        assert!(matches!(err, EngineError::ToolNotFound(ref id) if id == "nonexistent"));
    }

    #[tokio::test]
    async fn returns_error_for_missing_tool_id() {
        let invoke = InspectToolInvoke {
            descriptors: vec![],
        };

        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(json!({}), &mut state, &ext, &events);

        let err = invoke.invoke(ctx).await.unwrap_err();
        assert!(matches!(err, EngineError::ToolInvocation(_)));
    }
}

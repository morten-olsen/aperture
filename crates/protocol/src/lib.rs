use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Wire protocol ────────────────────────────────────────────────────

/// Messages sent from client to server.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Hello {
        token: String,
    },
    InvokeAction {
        id: String,
        action: String,
        input: Value,
    },
}

/// Messages sent from server to client.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    HelloAck { user_id: String },
    Event { event_id: String, payload: Value },
    ActionResult { id: String, result: Value },
    ActionError { id: String, error: String },
}

// ── HTTP auth types ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub created_at: String,
}

// ── Schema endpoint types ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaDocument {
    pub actions: Vec<ActionSchema>,
    pub events: Vec<EventSchema>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionSchema {
    pub id: String,
    pub description: String,
    pub input_schema: Value,
    pub output_schema: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventSchema {
    pub id: String,
    pub payload_schema: Option<Value>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn client_hello_round_trip() {
        let msg = ClientMessage::Hello {
            token: "jwt-token-here".into(),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "hello");
        assert_eq!(json["token"], "jwt-token-here");

        let decoded: ClientMessage = serde_json::from_value(json).unwrap();
        assert!(matches!(decoded, ClientMessage::Hello { token } if token == "jwt-token-here"));
    }

    #[test]
    fn client_invoke_action_round_trip() {
        let msg = ClientMessage::InvokeAction {
            id: "corr-1".into(),
            action: "create_conversation".into(),
            input: json!({"title": "Test"}),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "invoke_action");
        assert_eq!(json["id"], "corr-1");
        assert_eq!(json["action"], "create_conversation");

        let decoded: ClientMessage = serde_json::from_value(json).unwrap();
        assert!(
            matches!(decoded, ClientMessage::InvokeAction { id, action, .. } if id == "corr-1" && action == "create_conversation")
        );
    }

    #[test]
    fn server_hello_ack_round_trip() {
        let msg = ServerMessage::HelloAck {
            user_id: "alice".into(),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "hello_ack");

        let decoded: ServerMessage = serde_json::from_value(json).unwrap();
        assert!(matches!(decoded, ServerMessage::HelloAck { user_id } if user_id == "alice"));
    }

    #[test]
    fn server_event_round_trip() {
        let msg = ServerMessage::Event {
            event_id: "prompt.created".into(),
            payload: json!({"id": "p1"}),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "event");

        let decoded: ServerMessage = serde_json::from_value(json).unwrap();
        assert!(
            matches!(decoded, ServerMessage::Event { event_id, .. } if event_id == "prompt.created")
        );
    }

    #[test]
    fn server_action_result_round_trip() {
        let msg = ServerMessage::ActionResult {
            id: "corr-2".into(),
            result: json!({"ok": true}),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "action_result");

        let decoded: ServerMessage = serde_json::from_value(json).unwrap();
        assert!(matches!(decoded, ServerMessage::ActionResult { id, .. } if id == "corr-2"));
    }

    #[test]
    fn server_action_error_round_trip() {
        let msg = ServerMessage::ActionError {
            id: "corr-3".into(),
            error: "not found".into(),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["type"], "action_error");
        assert_eq!(json["error"], "not found");

        let decoded: ServerMessage = serde_json::from_value(json).unwrap();
        assert!(
            matches!(decoded, ServerMessage::ActionError { id, error } if id == "corr-3" && error == "not found")
        );
    }

    #[test]
    fn login_request_round_trip() {
        let req = LoginRequest {
            username: "alice".into(),
            password: "secret".into(),
        };
        let json = serde_json::to_string(&req).unwrap();
        let decoded: LoginRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.username, "alice");
        assert_eq!(decoded.password, "secret");
    }

    #[test]
    fn login_response_round_trip() {
        let resp = LoginResponse {
            token: "jwt-token".into(),
            user: UserInfo {
                id: "u1".into(),
                username: "alice".into(),
                created_at: "2024-01-01".into(),
            },
        };
        let json = serde_json::to_string(&resp).unwrap();
        let decoded: LoginResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.token, "jwt-token");
        assert_eq!(decoded.user.username, "alice");
    }

    #[test]
    fn schema_document_round_trip() {
        let doc = SchemaDocument {
            actions: vec![ActionSchema {
                id: "create_conversation".into(),
                description: "Create a conversation".into(),
                input_schema: json!({"type": "object"}),
                output_schema: None,
            }],
            events: vec![EventSchema {
                id: "prompt.created".into(),
                payload_schema: Some(json!({"type": "object"})),
            }],
        };
        let json = serde_json::to_string(&doc).unwrap();
        let decoded: SchemaDocument = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded.actions.len(), 1);
        assert_eq!(decoded.events.len(), 1);
        assert_eq!(decoded.actions[0].id, "create_conversation");
    }
}

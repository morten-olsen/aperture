use serde_json::Value;

pub struct App {
    pub conversation_id: String,
    pub messages: Vec<ChatMessage>,
    pub input: String,
    pub scroll_offset: u16,
    pub status: Status,
    pub total_usage: Usage,
    pub should_quit: bool,
    usage_counted: bool,
    current_prompt_id: Option<String>,
}

#[derive(Clone, PartialEq, Eq)]
pub enum Status {
    Connected,
    Waiting,
    WaitingForApproval { prompt_id: String },
}

#[derive(Default)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

pub enum Role {
    User,
    Assistant,
    System,
}

impl App {
    pub fn new(conversation_id: String) -> Self {
        Self {
            conversation_id,
            messages: Vec::new(),
            input: String::new(),
            scroll_offset: 0,
            status: Status::Connected,
            total_usage: Usage::default(),
            should_quit: false,
            usage_counted: false,
            current_prompt_id: None,
        }
    }

    /// Take the current input, push a user message, and return the text for sending.
    pub fn send_message(&mut self) -> Option<String> {
        if self.input.is_empty() || !matches!(self.status, Status::Connected) {
            return None;
        }
        let text = std::mem::take(&mut self.input);
        self.messages.push(ChatMessage {
            role: Role::User,
            content: text.clone(),
        });
        self.status = Status::Waiting;
        self.scroll_offset = 0;
        self.usage_counted = false;
        self.current_prompt_id = None;
        Some(text)
    }

    /// Handle a server event.
    ///
    /// Events update messages only — status transitions to `Connected`
    /// happen in `handle_action_result` once the full agent loop finishes.
    pub fn handle_event(&mut self, event_id: &str, payload: &Value) {
        match event_id {
            "prompt.updated" | "prompt.completed" => {
                self.update_from_prompt(payload);
            }
            "prompt.waiting_for_approval" => {
                self.update_from_prompt(payload);
                if let Some(id) = payload["id"].as_str() {
                    self.status = Status::WaitingForApproval {
                        prompt_id: id.to_string(),
                    };
                }
            }
            _ => {}
        }
    }

    /// Handle the action result from `send_message` as a reliable fallback.
    ///
    /// The action always returns the final `Prompt`, so even if the
    /// `prompt.completed` event was missed, this guarantees the response
    /// is rendered.
    pub fn handle_action_result(&mut self, payload: &Value) {
        if payload["state"].as_str() == Some("waiting_for_approval") {
            self.update_from_prompt(payload);
            if let Some(id) = payload["id"].as_str() {
                self.status = Status::WaitingForApproval {
                    prompt_id: id.to_string(),
                };
            }
        } else {
            self.finish_prompt(payload);
        }
    }

    fn finish_prompt(&mut self, payload: &Value) {
        self.update_from_prompt(payload);
        self.status = Status::Connected;
        if !self.usage_counted {
            self.usage_counted = true;
            if let Some(usage) = payload.get("usage") {
                self.total_usage.prompt_tokens +=
                    usage["prompt_tokens"].as_u64().unwrap_or(0) as u32;
                self.total_usage.completion_tokens +=
                    usage["completion_tokens"].as_u64().unwrap_or(0) as u32;
            }
        }
    }

    /// Handle an action error (e.g. send_message failed).
    pub fn handle_error(&mut self, error: String) {
        self.messages.push(ChatMessage {
            role: Role::System,
            content: error,
        });
        self.status = Status::Connected;
    }

    fn update_from_prompt(&mut self, payload: &Value) {
        let outputs = match payload.get("output").and_then(|o| o.as_array()) {
            Some(arr) => arr,
            None => return,
        };

        let prompt_id = payload["id"].as_str().map(|s| s.to_string());

        let mut lines = Vec::new();
        for output in outputs {
            match output.get("type").and_then(|t| t.as_str()) {
                Some("text") => {
                    if let Some(content) = output.get("content").and_then(|c| c.as_str()) {
                        lines.push(content.to_string());
                    }
                }
                Some("tool") => {
                    let tool_id = output
                        .get("tool_id")
                        .and_then(|t| t.as_str())
                        .unwrap_or("?");
                    let result_obj = output.get("result").filter(|r| !r.is_null());
                    let status = match result_obj {
                        Some(r) => match r.get("status").and_then(|s| s.as_str()) {
                            Some("success") => "ok",
                            Some("error") => "err",
                            _ => "...",
                        },
                        None => "...",
                    };
                    lines.push(format!("[tool: {tool_id}] {status}"));
                    if let Some(v) = output.get("input").filter(|v| !v.is_null()) {
                        let s = serde_json::to_string(v).unwrap_or_default();
                        if s != "{}" {
                            lines.push(format!("[tool-input] {s}"));
                        }
                    }
                    if let Some(r) = result_obj {
                        if let Some(err) = r.get("error").and_then(|e| e.as_str()) {
                            lines.push(format!("[tool-result] error: {err}"));
                        } else if let Some(out) = r.get("output").filter(|v| !v.is_null()) {
                            let s = serde_json::to_string(out).unwrap_or_default();
                            lines.push(format!("[tool-result] {s}"));
                        }
                    }
                }
                Some("file") => {
                    let path = output.get("path").and_then(|p| p.as_str()).unwrap_or("?");
                    lines.push(format!("[file: {path}]"));
                }
                _ => {}
            }
        }

        let content = lines.join("\n");

        // Same prompt → replace its assistant message; new prompt → push a new one.
        let same_prompt = prompt_id.is_some() && prompt_id == self.current_prompt_id;

        if same_prompt {
            if let Some(last) = self.messages.last_mut() {
                if matches!(last.role, Role::Assistant) {
                    last.content = content;
                    return;
                }
            }
        }

        self.current_prompt_id = prompt_id;
        self.messages.push(ChatMessage {
            role: Role::Assistant,
            content,
        });
    }

    /// If waiting for approval, return the action payload to approve and reset status.
    pub fn approve(&mut self) -> Option<(String, Value)> {
        if let Status::WaitingForApproval { prompt_id } = &self.status {
            let payload = serde_json::json!({
                "conversation_id": self.conversation_id,
                "prompt_id": prompt_id,
            });
            self.status = Status::Waiting;
            Some(("approve_prompt".to_string(), payload))
        } else {
            None
        }
    }

    /// If waiting for approval, return the action payload to reject and reset status.
    pub fn reject(&mut self) -> Option<(String, Value)> {
        if let Status::WaitingForApproval { prompt_id } = &self.status {
            let payload = serde_json::json!({
                "conversation_id": self.conversation_id,
                "prompt_id": prompt_id,
                "reason": "user rejected",
            });
            self.status = Status::Waiting;
            Some(("reject_prompt".to_string(), payload))
        } else {
            None
        }
    }

    pub fn scroll_up(&mut self, amount: u16) {
        self.scroll_offset = self.scroll_offset.saturating_add(amount);
    }

    pub fn scroll_down(&mut self, amount: u16) {
        self.scroll_offset = self.scroll_offset.saturating_sub(amount);
    }
}

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
        Some(text)
    }

    /// Handle a server event.
    pub fn handle_event(&mut self, event_id: &str, payload: &Value) {
        match event_id {
            "prompt.updated" => {
                self.update_from_prompt(payload);
            }
            "prompt.completed" => {
                self.finish_prompt(payload);
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
                    let status = match output.get("result") {
                        Some(r) if !r.is_null() => match r.get("status").and_then(|s| s.as_str()) {
                            Some("success") => "ok",
                            Some("error") => "err",
                            _ => "...",
                        },
                        _ => "...",
                    };
                    lines.push(format!("[tool: {tool_id}] {status}"));
                }
                Some("file") => {
                    let path = output.get("path").and_then(|p| p.as_str()).unwrap_or("?");
                    lines.push(format!("[file: {path}]"));
                }
                _ => {}
            }
        }

        let content = lines.join("\n");

        // Replace the latest assistant message, or push a new one.
        if let Some(last) = self.messages.last_mut() {
            if matches!(last.role, Role::Assistant) {
                last.content = content;
                return;
            }
        }
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

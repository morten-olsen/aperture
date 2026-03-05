use aperture_engine::event::EventDescriptor;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationCreatedPayload {
    pub conversation_id: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationPromptAttachedPayload {
    pub conversation_id: String,
    pub prompt_id: String,
}

pub static CONVERSATION_CREATED: EventDescriptor<ConversationCreatedPayload> =
    EventDescriptor::new("conversation.created");

pub static CONVERSATION_PROMPT_ATTACHED: EventDescriptor<ConversationPromptAttachedPayload> =
    EventDescriptor::new("conversation.prompt_attached");

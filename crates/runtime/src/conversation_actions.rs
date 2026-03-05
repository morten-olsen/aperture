use async_trait::async_trait;
use serde_json::{json, Value};
use uuid::Uuid;

use aperture_engine::action::ActionContext;
use aperture_engine::error::{EngineError, Result};
use aperture_engine::prompt::Prompt;
use aperture_engine::prompt_runner::PromptRunner;

use crate::conversation_db;
use crate::conversation_events::{
    ConversationCreatedPayload, ConversationPromptAttachedPayload, CONVERSATION_CREATED,
    CONVERSATION_PROMPT_ATTACHED,
};
use crate::db_plugin::DatabaseService;

fn get_db<'a>(ctx: &'a ActionContext<'a>) -> Result<&'a DatabaseService> {
    ctx.extensions
        .get::<DatabaseService>()
        .ok_or_else(|| EngineError::ToolInvocation("DatabaseService not found".into()))
}

// ── CreateConversation ──────────────────────────────────────────────

pub struct CreateConversation;

#[async_trait]
impl aperture_engine::action::ActionInvoke for CreateConversation {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let db = get_db(&ctx)?;
        let id = Uuid::new_v4().to_string();
        let title = ctx.input["title"].as_str().map(|s| s.to_string());
        let description = ctx.input["description"].as_str().map(|s| s.to_string());
        let user_id = ctx.user_id.clone();

        let id_clone = id.clone();
        db.call(move |conn| {
            conversation_db::create_conversation(
                conn,
                &id_clone,
                &user_id,
                title.as_deref(),
                description.as_deref(),
            )
        })
        .await?;

        ctx.events
            .publish(
                &CONVERSATION_CREATED,
                &ConversationCreatedPayload {
                    conversation_id: id.clone(),
                    user_id: ctx.user_id.clone(),
                },
            )
            .await;

        Ok(json!({"conversation_id": id}))
    }
}

// ── ListConversations ───────────────────────────────────────────────

pub struct ListConversations;

#[async_trait]
impl aperture_engine::action::ActionInvoke for ListConversations {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let db = get_db(&ctx)?;
        let user_id = ctx.user_id.clone();

        let conversations: Vec<conversation_db::ConversationRow> = db
            .call(move |conn| conversation_db::list_conversations(conn, &user_id))
            .await?;

        Ok(serde_json::to_value(conversations)
            .map_err(|e| EngineError::ToolInvocation(format!("serialize: {e}")))?)
    }
}

// ── GetConversation ─────────────────────────────────────────────────

pub struct GetConversation;

#[async_trait]
impl aperture_engine::action::ActionInvoke for GetConversation {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let db = get_db(&ctx)?;
        let conversation_id = ctx.input["conversation_id"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("conversation_id required".into()))?
            .to_string();

        let (conv, prompts): (conversation_db::ConversationRow, Vec<conversation_db::PromptRow>) = db
            .call(move |conn| {
                conversation_db::get_conversation_with_prompts(conn, &conversation_id)
            })
            .await?;

        // Convert prompt rows to engine Prompts.
        let engine_prompts: Vec<Prompt> = prompts
            .iter()
            .filter_map(|row| conversation_db::row_to_prompt(row).ok())
            .collect();

        Ok(json!({
            "conversation": conv,
            "prompts": engine_prompts,
        }))
    }
}

// ── SendMessage ─────────────────────────────────────────────────────

pub struct SendMessage;

#[async_trait]
impl aperture_engine::action::ActionInvoke for SendMessage {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let db = get_db(&ctx)?;
        let conversation_id = ctx.input["conversation_id"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("conversation_id required".into()))?
            .to_string();
        let message = ctx.input["message"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("message required".into()))?
            .to_string();

        // Load history from DB.
        let conv_id_clone = conversation_id.clone();
        let (_, prompt_rows): (conversation_db::ConversationRow, Vec<conversation_db::PromptRow>) = db
            .call(move |conn| {
                conversation_db::get_conversation_with_prompts(conn, &conv_id_clone)
            })
            .await?;

        let history: Vec<Prompt> = prompt_rows
            .iter()
            .filter_map(|row| conversation_db::row_to_prompt(row).ok())
            .collect();

        // Get the PromptRunner from extensions and run.
        let runner = ctx
            .extensions
            .get::<Box<dyn PromptRunner>>()
            .ok_or_else(|| EngineError::ToolInvocation("PromptRunner not found".into()))?;

        let prompt = runner.run(&ctx.user_id, &message, &history).await?;

        // Persist the prompt.
        let prompt_id = prompt.id.clone();
        let user_id = prompt.user_id.clone();
        let state = conversation_db::state_to_str(&prompt.state).to_string();
        let input = prompt.input.clone();
        let output_json = serde_json::to_string(&prompt.output)
            .map_err(|e| EngineError::ToolInvocation(format!("serialize output: {e}")))?;
        let usage_json = serde_json::to_string(&prompt.usage)
            .map_err(|e| EngineError::ToolInvocation(format!("serialize usage: {e}")))?;

        let pid = prompt_id.clone();
        db.call(move |conn| {
            conversation_db::upsert_prompt(
                conn,
                &pid,
                &user_id,
                &state,
                input.as_deref(),
                &output_json,
                &usage_json,
            )
        })
        .await?;

        // Attach to conversation.
        let conv_id_clone = conversation_id.clone();
        let pid = prompt_id.clone();
        db.call(move |conn| conversation_db::attach_prompt(conn, &conv_id_clone, &pid))
            .await?;

        ctx.events
            .publish(
                &CONVERSATION_PROMPT_ATTACHED,
                &ConversationPromptAttachedPayload {
                    conversation_id,
                    prompt_id,
                },
            )
            .await;

        Ok(serde_json::to_value(&prompt)
            .map_err(|e| EngineError::ToolInvocation(format!("serialize: {e}")))?)
    }
}

// ── AttachPrompt ────────────────────────────────────────────────────

pub struct AttachPrompt;

#[async_trait]
impl aperture_engine::action::ActionInvoke for AttachPrompt {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
        let db = get_db(&ctx)?;
        let conversation_id = ctx.input["conversation_id"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("conversation_id required".into()))?
            .to_string();
        let prompt_id = ctx.input["prompt_id"]
            .as_str()
            .ok_or_else(|| EngineError::ToolInvocation("prompt_id required".into()))?
            .to_string();

        let conv_id_clone = conversation_id.clone();
        let pid = prompt_id.clone();
        db.call(move |conn| conversation_db::attach_prompt(conn, &conv_id_clone, &pid))
            .await?;

        ctx.events
            .publish(
                &CONVERSATION_PROMPT_ATTACHED,
                &ConversationPromptAttachedPayload {
                    conversation_id,
                    prompt_id,
                },
            )
            .await;

        Ok(json!({"ok": true}))
    }
}

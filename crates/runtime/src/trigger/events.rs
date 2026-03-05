use aperture_engine::event::EventDescriptor;
use serde::{Deserialize, Serialize};

use super::model::TriggerStatus;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerFiredPayload {
    pub name: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerCompletedPayload {
    pub name: String,
    pub user_id: String,
    pub continuation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerFailedPayload {
    pub name: String,
    pub user_id: String,
    pub error: String,
    pub consecutive_failures: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerStatusChangedPayload {
    pub name: String,
    pub old_status: TriggerStatus,
    pub new_status: TriggerStatus,
}

pub static TRIGGER_FIRED: EventDescriptor<TriggerFiredPayload> =
    EventDescriptor::new("trigger.fired");

pub static TRIGGER_COMPLETED: EventDescriptor<TriggerCompletedPayload> =
    EventDescriptor::new("trigger.completed");

pub static TRIGGER_FAILED: EventDescriptor<TriggerFailedPayload> =
    EventDescriptor::new("trigger.failed");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerUpdatedPayload {
    pub name: String,
    pub user_id: String,
}

pub static TRIGGER_STATUS_CHANGED: EventDescriptor<TriggerStatusChangedPayload> =
    EventDescriptor::new("trigger.status_changed");

pub static TRIGGER_UPDATED: EventDescriptor<TriggerUpdatedPayload> =
    EventDescriptor::new("trigger.updated");

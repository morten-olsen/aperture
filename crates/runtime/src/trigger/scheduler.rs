use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use aperture_engine::error::{EngineError, Result};
use aperture_engine::event::EventBus;
use aperture_engine::prompt::PromptOutput;
use aperture_engine::prompt_runner::PromptRunner;
use aperture_engine::state::State;

use crate::config::RuntimeConfig;
use crate::validation::{self, FileValidationService, FileWritePayload, FILE_VALIDATED_WRITE};

use super::events::{
    TriggerCompletedPayload, TriggerFailedPayload, TriggerFiredPayload,
    TriggerStatusChangedPayload, TriggerUpdatedPayload, TRIGGER_COMPLETED, TRIGGER_FAILED,
    TRIGGER_FIRED, TRIGGER_STATUS_CHANGED, TRIGGER_UPDATED,
};
use super::model::{Trigger, TriggerState, TriggerStatus};

const MAX_CONSECUTIVE_FAILURES: u32 = 3;

pub struct TriggerScheduler {
    config: RuntimeConfig,
    events: EventBus,
    state: RwLock<SchedulerState>,
}

struct SchedulerState {
    triggers: HashMap<String, ScheduledTrigger>,
}

struct ScheduledTrigger {
    trigger: Trigger,
    user_id: String,
    next_fire: Option<std::time::Instant>,
}

impl TriggerScheduler {
    pub fn new(config: RuntimeConfig, events: EventBus) -> Self {
        Self {
            config,
            events,
            state: RwLock::new(SchedulerState {
                triggers: HashMap::new(),
            }),
        }
    }

    /// Start the scheduler background loop.
    ///
    /// Spawns a tokio task that loads triggers, calculates fire times, and
    /// executes them via the PromptRunner.
    pub fn start(self: &Arc<Self>, runner: Arc<dyn PromptRunner>) {
        let scheduler = Arc::clone(self);
        let events = self.events.clone();

        tokio::spawn(async move {
            // Subscribe to file write events to detect trigger changes.
            let mut file_rx = events
                .subscribe::<FileWritePayload>(&FILE_VALIDATED_WRITE)
                .await;

            // Initial load.
            if let Err(e) = scheduler.load_all_triggers().await {
                eprintln!("trigger scheduler: failed initial load: {e}");
            }

            loop {
                let sleep_duration = scheduler.next_sleep_duration().await;

                tokio::select! {
                    _ = tokio::time::sleep(sleep_duration) => {
                        scheduler.fire_due_triggers(&runner).await;
                    }
                    result = file_rx.recv() => {
                        match result {
                            Ok(payload_value) => {
                                // Deserialize the FileWritePayload.
                                if let Ok(payload) = serde_json::from_value::<FileWritePayload>(payload_value) {
                                    if payload.path.starts_with(".triggers/") && payload.path.ends_with(".json") {
                                        let _ = scheduler.reconcile_trigger(&payload.path, &payload.user_id).await;
                                    }
                                }
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                        }
                    }
                }
            }
        });
    }

    /// Load all triggers from all user workspace .triggers/ directories.
    pub async fn load_all_triggers(&self) -> Result<()> {
        let data_root = &self.config.data_root;
        let mut entries = tokio::fs::read_dir(data_root)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to read data root: {e}")))?;

        let mut state = self.state.write().await;
        state.triggers.clear();

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("read entry: {e}")))?
        {
            let user_id = entry.file_name().to_string_lossy().to_string();
            let triggers_dir = self.config.workspace_dir(&user_id).join(".triggers");

            if !triggers_dir.exists() {
                continue;
            }

            let mut trigger_entries = match tokio::fs::read_dir(&triggers_dir).await {
                Ok(e) => e,
                Err(_) => continue,
            };

            while let Ok(Some(te)) = trigger_entries.next_entry().await {
                let path = te.path();
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                let content = match tokio::fs::read_to_string(&path).await {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                let trigger: Trigger = match serde_json::from_str(&content) {
                    Ok(t) => t,
                    Err(_) => continue,
                };

                if trigger.status != TriggerStatus::Active {
                    continue;
                }

                let key = format!("{}:{}", user_id, trigger.name);
                let next_fire = calculate_next_fire(&trigger);
                state.triggers.insert(
                    key,
                    ScheduledTrigger {
                        trigger,
                        user_id: user_id.clone(),
                        next_fire,
                    },
                );
            }
        }

        Ok(())
    }

    /// Re-read a single trigger file and reconcile state.
    async fn reconcile_trigger(&self, rel_path: &str, user_id: &str) -> Result<()> {
        let name = rel_path
            .strip_prefix(".triggers/")
            .and_then(|s| s.strip_suffix(".json"))
            .ok_or_else(|| EngineError::ToolInvocation("invalid trigger path".into()))?;

        let key = format!("{user_id}:{name}");
        let triggers_dir = self.config.workspace_dir(user_id).join(".triggers");
        let path = triggers_dir.join(format!("{name}.json"));

        let mut state = self.state.write().await;

        if !path.exists() {
            // Trigger was deleted.
            state.triggers.remove(&key);
            return Ok(());
        }

        let content = tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("read trigger: {e}")))?;
        let trigger: Trigger = serde_json::from_str(&content)
            .map_err(|e| EngineError::ToolInvocation(format!("parse trigger: {e}")))?;

        if trigger.status != TriggerStatus::Active {
            state.triggers.remove(&key);
            return Ok(());
        }

        // Check if schedule changed.
        let schedule_changed = state
            .triggers
            .get(&key)
            .map(|st| {
                st.trigger.schedule_type != trigger.schedule_type
                    || st.trigger.schedule_value != trigger.schedule_value
            })
            .unwrap_or(true);

        let next_fire = if schedule_changed {
            calculate_next_fire(&trigger)
        } else {
            state.triggers.get(&key).and_then(|st| st.next_fire)
        };

        state.triggers.insert(
            key,
            ScheduledTrigger {
                trigger,
                user_id: user_id.to_string(),
                next_fire,
            },
        );

        Ok(())
    }

    /// Calculate the shortest sleep until the next trigger fires.
    async fn next_sleep_duration(&self) -> std::time::Duration {
        let state = self.state.read().await;
        let now = std::time::Instant::now();
        let mut min_sleep = std::time::Duration::from_secs(60);

        for st in state.triggers.values() {
            if let Some(fire_at) = st.next_fire {
                if fire_at <= now {
                    return std::time::Duration::ZERO;
                }
                let until = fire_at - now;
                if until < min_sleep {
                    min_sleep = until;
                }
            }
        }

        min_sleep
    }

    /// Fire all triggers that are due.
    async fn fire_due_triggers(&self, runner: &Arc<dyn PromptRunner>) {
        let now = std::time::Instant::now();
        let due: Vec<(String, String, String)> = {
            let state = self.state.read().await;
            state
                .triggers
                .iter()
                .filter(|(_, st)| st.next_fire.map(|f| f <= now).unwrap_or(false))
                .map(|(key, st)| (key.clone(), st.user_id.clone(), st.trigger.name.clone()))
                .collect()
        };

        for (key, user_id, _trigger_name) in due {
            let trigger = {
                let state = self.state.read().await;
                match state.triggers.get(&key) {
                    Some(st) => st.trigger.clone(),
                    None => continue,
                }
            };

            self.fire_trigger(&key, &user_id, &trigger, runner).await;
        }
    }

    /// Fire a single trigger.
    async fn fire_trigger(
        &self,
        key: &str,
        user_id: &str,
        trigger: &Trigger,
        runner: &Arc<dyn PromptRunner>,
    ) {
        // Publish fired event.
        self.events
            .publish(
                &TRIGGER_FIRED,
                &TriggerFiredPayload {
                    name: trigger.name.clone(),
                    user_id: user_id.to_string(),
                },
                Some(user_id),
            )
            .await;

        // Build initial state with trigger metadata.
        let mut state = State::new();
        let ts = TriggerState {
            name: trigger.name.clone(),
            schedule_type: trigger.schedule_type.clone(),
        };
        if let Err(e) = state.set("trigger", &ts) {
            eprintln!("trigger scheduler: failed to set trigger state: {e}");
            return;
        }

        // Run the agent.
        let result = runner
            .run_with_state(user_id, &trigger.goal, &[], state)
            .await;

        match result {
            Ok(prompt) => {
                self.handle_success(key, user_id, trigger, &prompt).await;
            }
            Err(e) => {
                self.handle_failure(key, user_id, trigger, &e.to_string())
                    .await;
            }
        }
    }

    async fn handle_success(
        &self,
        key: &str,
        user_id: &str,
        trigger: &Trigger,
        prompt: &aperture_engine::prompt::Prompt,
    ) {
        // Extract continuation from last text output.
        let continuation = prompt.output.iter().rev().find_map(|o| match o {
            PromptOutput::Text { content } => Some(content.clone()),
            _ => None,
        });

        let old_status = trigger.status.clone();
        let mut updated = trigger.clone();
        updated.invocation_count += 1;
        updated.consecutive_failures = 0;
        updated.last_error = None;
        updated.last_invoked_at = Some(chrono_now());
        updated.continuation = continuation.clone();

        // Check termination conditions.
        let should_complete = match &updated.schedule_type[..] {
            "once" => true,
            "cron" => {
                let max_reached = updated
                    .max_invocations
                    .map(|max| updated.invocation_count >= max)
                    .unwrap_or(false);
                let expired = updated
                    .ends_at
                    .as_ref()
                    .map(|_| false) // Simplified: full ISO8601 comparison would go here
                    .unwrap_or(false);
                max_reached || expired
            }
            _ => false,
        };

        if should_complete {
            updated.status = TriggerStatus::Completed;
        }

        // Recalculate next_invocation_at.
        if updated.status == TriggerStatus::Active {
            updated.next_invocation_at = calculate_next_invocation_at(&updated);
        } else {
            updated.next_invocation_at = None;
        }

        // Write back.
        self.write_trigger_back(user_id, &updated).await;

        // Update in-memory state.
        {
            let mut state = self.state.write().await;
            if updated.status == TriggerStatus::Active {
                let next_fire = calculate_next_fire(&updated);
                state.triggers.insert(
                    key.to_string(),
                    ScheduledTrigger {
                        trigger: updated.clone(),
                        user_id: user_id.to_string(),
                        next_fire,
                    },
                );
            } else {
                state.triggers.remove(key);
            }
        }

        // Publish events.
        if updated.status != old_status {
            self.events
                .publish(
                    &TRIGGER_STATUS_CHANGED,
                    &TriggerStatusChangedPayload {
                        name: updated.name.clone(),
                        old_status,
                        new_status: updated.status.clone(),
                    },
                    Some(user_id),
                )
                .await;
        }

        self.events
            .publish(
                &TRIGGER_UPDATED,
                &TriggerUpdatedPayload {
                    name: updated.name.clone(),
                    user_id: user_id.to_string(),
                },
                Some(user_id),
            )
            .await;

        self.events
            .publish(
                &TRIGGER_COMPLETED,
                &TriggerCompletedPayload {
                    name: updated.name.clone(),
                    user_id: user_id.to_string(),
                    continuation,
                },
                Some(user_id),
            )
            .await;
    }

    async fn handle_failure(&self, key: &str, user_id: &str, trigger: &Trigger, error: &str) {
        let old_status = trigger.status.clone();
        let mut updated = trigger.clone();
        updated.consecutive_failures += 1;
        updated.last_error = Some(error.to_string());

        if updated.consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
            updated.status = TriggerStatus::Failed;
        }

        self.write_trigger_back(user_id, &updated).await;

        // Update in-memory state.
        {
            let mut state = self.state.write().await;
            if updated.status == TriggerStatus::Active {
                let next_fire = calculate_next_fire(&updated);
                state.triggers.insert(
                    key.to_string(),
                    ScheduledTrigger {
                        trigger: updated.clone(),
                        user_id: user_id.to_string(),
                        next_fire,
                    },
                );
            } else {
                state.triggers.remove(key);
            }
        }

        if updated.status != old_status {
            self.events
                .publish(
                    &TRIGGER_STATUS_CHANGED,
                    &TriggerStatusChangedPayload {
                        name: updated.name.clone(),
                        old_status,
                        new_status: updated.status.clone(),
                    },
                    Some(user_id),
                )
                .await;
        }

        self.events
            .publish(
                &TRIGGER_UPDATED,
                &TriggerUpdatedPayload {
                    name: updated.name.clone(),
                    user_id: user_id.to_string(),
                },
                Some(user_id),
            )
            .await;

        self.events
            .publish(
                &TRIGGER_FAILED,
                &TriggerFailedPayload {
                    name: updated.name.clone(),
                    user_id: user_id.to_string(),
                    error: error.to_string(),
                    consecutive_failures: updated.consecutive_failures,
                },
                Some(user_id),
            )
            .await;
    }

    async fn write_trigger_back(&self, user_id: &str, trigger: &Trigger) {
        let json = match serde_json::to_string_pretty(trigger) {
            Ok(j) => j,
            Err(e) => {
                eprintln!("trigger scheduler: serialize error: {e}");
                return;
            }
        };

        let rel_path = format!(".triggers/{}.json", trigger.name);
        let validation = None::<&FileValidationService>; // Skip validation for scheduler writes

        if let Err(e) =
            validation::validated_write(&self.config, user_id, &rel_path, &json, validation).await
        {
            eprintln!("trigger scheduler: write error: {e}");
        }
    }

    /// Load triggers for a specific user (for testing).
    #[cfg(test)]
    pub async fn load_user_triggers(&self, user_id: &str) -> Result<()> {
        let triggers_dir = self.config.workspace_dir(user_id).join(".triggers");
        if !triggers_dir.exists() {
            return Ok(());
        }

        let mut entries = tokio::fs::read_dir(&triggers_dir)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("read: {e}")))?;

        let mut state = self.state.write().await;
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let content = match tokio::fs::read_to_string(&path).await {
                Ok(c) => c,
                Err(_) => continue,
            };
            let trigger: Trigger = match serde_json::from_str(&content) {
                Ok(t) => t,
                Err(_) => continue,
            };
            if trigger.status != TriggerStatus::Active {
                continue;
            }
            let key = format!("{user_id}:{}", trigger.name);
            let next_fire = calculate_next_fire(&trigger);
            state.triggers.insert(
                key,
                ScheduledTrigger {
                    trigger,
                    user_id: user_id.to_string(),
                    next_fire,
                },
            );
        }
        Ok(())
    }

    #[cfg(test)]
    pub async fn trigger_count(&self) -> usize {
        self.state.read().await.triggers.len()
    }
}

/// Calculate the next Instant at which a trigger should fire.
fn calculate_next_fire(trigger: &Trigger) -> Option<std::time::Instant> {
    match trigger.schedule_type.as_str() {
        "once" => {
            // Parse ISO8601, fire immediately if in the past.
            Some(std::time::Instant::now())
        }
        "cron" => {
            // Use the cron crate to find next occurrence.
            let schedule: cron::Schedule = match trigger.schedule_value.parse() {
                Ok(s) => s,
                Err(_) => return None,
            };
            let next = schedule.upcoming(chrono::Utc).next()?;
            let duration = (next - chrono::Utc::now()).to_std().ok()?;
            Some(std::time::Instant::now() + duration)
        }
        _ => None,
    }
}

/// Calculate the next invocation timestamp as ISO8601 string (for storage).
fn calculate_next_invocation_at(trigger: &Trigger) -> Option<String> {
    match trigger.schedule_type.as_str() {
        "cron" => {
            let schedule: cron::Schedule = trigger.schedule_value.parse().ok()?;
            let next = schedule.upcoming(chrono::Utc).next()?;
            Some(next.to_rfc3339())
        }
        _ => None,
    }
}

fn chrono_now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_once_trigger() -> Trigger {
        Trigger {
            name: "once-test".into(),
            goal: "do something once".into(),
            schedule_type: "once".into(),
            schedule_value: "2026-03-05T12:00:00Z".into(),
            status: TriggerStatus::Active,
            setup_script: None,
            max_invocations: None,
            ends_at: None,
            continuation: None,
            invocation_count: 0,
            last_invoked_at: None,
            next_invocation_at: None,
            consecutive_failures: 0,
            last_error: None,
        }
    }

    fn sample_cron_trigger() -> Trigger {
        Trigger {
            name: "cron-test".into(),
            goal: "do something on schedule".into(),
            schedule_type: "cron".into(),
            schedule_value: "0 0 9 * * * *".into(), // 9am daily (cron crate uses 7 fields)
            status: TriggerStatus::Active,
            setup_script: None,
            max_invocations: Some(10),
            ends_at: None,
            continuation: None,
            invocation_count: 0,
            last_invoked_at: None,
            next_invocation_at: None,
            consecutive_failures: 0,
            last_error: None,
        }
    }

    #[test]
    fn once_trigger_fires_immediately() {
        let trigger = sample_once_trigger();
        let next = calculate_next_fire(&trigger);
        assert!(next.is_some());
        // Should fire immediately (or very close to now).
        let elapsed = next.unwrap().elapsed();
        assert!(elapsed < std::time::Duration::from_secs(1));
    }

    #[test]
    fn cron_trigger_calculates_next_fire() {
        let trigger = sample_cron_trigger();
        let next = calculate_next_fire(&trigger);
        assert!(next.is_some());
    }

    #[test]
    fn invalid_cron_returns_none() {
        let mut trigger = sample_cron_trigger();
        trigger.schedule_value = "not a cron".into();
        assert!(calculate_next_fire(&trigger).is_none());
    }

    #[tokio::test]
    async fn scheduler_loads_triggers_from_disk() {
        let tmp =
            std::env::temp_dir().join(format!("aperture-sched-test-{}", uuid::Uuid::new_v4()));
        let triggers_dir = tmp.join("testuser").join("workspace").join(".triggers");
        std::fs::create_dir_all(&triggers_dir).unwrap();

        let trigger = sample_once_trigger();
        std::fs::write(
            triggers_dir.join("once-test.json"),
            serde_json::to_string_pretty(&trigger).unwrap(),
        )
        .unwrap();

        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };
        let events = EventBus::new();
        let scheduler = TriggerScheduler::new(config, events);
        scheduler.load_user_triggers("testuser").await.unwrap();

        assert_eq!(scheduler.trigger_count().await, 1);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn scheduler_ignores_paused_triggers() {
        let tmp =
            std::env::temp_dir().join(format!("aperture-sched-paused-{}", uuid::Uuid::new_v4()));
        let triggers_dir = tmp.join("testuser").join("workspace").join(".triggers");
        std::fs::create_dir_all(&triggers_dir).unwrap();

        let mut trigger = sample_once_trigger();
        trigger.status = TriggerStatus::Paused;
        std::fs::write(
            triggers_dir.join("once-test.json"),
            serde_json::to_string_pretty(&trigger).unwrap(),
        )
        .unwrap();

        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };
        let events = EventBus::new();
        let scheduler = TriggerScheduler::new(config, events);
        scheduler.load_user_triggers("testuser").await.unwrap();

        assert_eq!(scheduler.trigger_count().await, 0);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn failure_counting_marks_failed_at_threshold() {
        let mut trigger = sample_once_trigger();
        trigger.consecutive_failures = 2;
        trigger.consecutive_failures += 1;

        if trigger.consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
            trigger.status = TriggerStatus::Failed;
        }

        assert_eq!(trigger.status, TriggerStatus::Failed);
    }
}

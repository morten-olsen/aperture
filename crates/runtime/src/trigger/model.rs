use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TriggerStatus {
    Active,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trigger {
    pub name: String,
    pub goal: String,
    pub schedule_type: String,
    pub schedule_value: String,
    pub status: TriggerStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub setup_script: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_invocations: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub continuation: Option<String>,
    #[serde(default)]
    pub invocation_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_invoked_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_invocation_at: Option<String>,
    #[serde(default)]
    pub consecutive_failures: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

/// State injected into `State` when a prompt is triggered by the scheduler.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerState {
    pub name: String,
    pub schedule_type: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trigger_serialization_round_trip() {
        let trigger = Trigger {
            name: "daily-report".into(),
            goal: "Generate a daily summary".into(),
            schedule_type: "cron".into(),
            schedule_value: "0 9 * * *".into(),
            status: TriggerStatus::Active,
            setup_script: Some("fetch_data()".into()),
            max_invocations: Some(100),
            ends_at: None,
            continuation: Some("Previous report was about Q4".into()),
            invocation_count: 5,
            last_invoked_at: Some("2026-03-04T09:00:00Z".into()),
            next_invocation_at: Some("2026-03-05T09:00:00Z".into()),
            consecutive_failures: 0,
            last_error: None,
        };

        let json = serde_json::to_string_pretty(&trigger).unwrap();
        let deserialized: Trigger = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.name, "daily-report");
        assert_eq!(deserialized.status, TriggerStatus::Active);
        assert_eq!(deserialized.invocation_count, 5);
        assert_eq!(deserialized.setup_script, Some("fetch_data()".into()));
    }

    #[test]
    fn trigger_status_serialization() {
        let active = serde_json::to_value(TriggerStatus::Active).unwrap();
        assert_eq!(active, "active");

        let failed = serde_json::to_value(TriggerStatus::Failed).unwrap();
        assert_eq!(failed, "failed");

        let completed: TriggerStatus = serde_json::from_str("\"completed\"").unwrap();
        assert_eq!(completed, TriggerStatus::Completed);
    }

    #[test]
    fn trigger_minimal_deserialization() {
        let json = r#"{
            "name": "test",
            "goal": "do something",
            "schedule_type": "once",
            "schedule_value": "2026-03-05T12:00:00Z",
            "status": "active"
        }"#;

        let trigger: Trigger = serde_json::from_str(json).unwrap();
        assert_eq!(trigger.name, "test");
        assert_eq!(trigger.invocation_count, 0);
        assert_eq!(trigger.consecutive_failures, 0);
        assert!(trigger.setup_script.is_none());
        assert!(trigger.continuation.is_none());
    }
}

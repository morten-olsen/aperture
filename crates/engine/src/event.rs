use std::collections::HashMap;
use std::marker::PhantomData;
use std::sync::Arc;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use tokio::sync::{broadcast, RwLock};

/// A typed event descriptor, used to define events with a specific payload type.
///
/// The string `id` is the event's wire name (e.g. "prompt.created").
/// The phantom type `T` constrains the payload.
pub struct EventDescriptor<T> {
    pub id: &'static str,
    _marker: PhantomData<T>,
}

impl<T> EventDescriptor<T> {
    pub const fn new(id: &'static str) -> Self {
        Self {
            id,
            _marker: PhantomData,
        }
    }
}

/// An envelope carrying an event's ID alongside its JSON-serialized payload.
#[derive(Debug, Clone)]
pub struct EventEnvelope {
    pub event_id: String,
    pub payload: Value,
}

/// A broadcast-based event bus.
///
/// Events are published as JSON-serialized values keyed by string event IDs.
/// Each named event has its own broadcast channel; a wildcard channel receives
/// all events.
pub struct EventBus {
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<Value>>>>,
    wildcard: broadcast::Sender<EventEnvelope>,
    schemas: Arc<RwLock<HashMap<String, Value>>>,
}

impl EventBus {
    pub fn new() -> Self {
        let (wildcard, _) = broadcast::channel(256);
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
            wildcard,
            schemas: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Pre-register a named event channel. Optional — publish will auto-register.
    pub async fn register_event<T>(&self, descriptor: &EventDescriptor<T>) {
        let mut channels = self.channels.write().await;
        channels
            .entry(descriptor.id.to_string())
            .or_insert_with(|| broadcast::channel(64).0);
    }

    /// Publish a typed event.
    pub async fn publish<T: Serialize>(&self, descriptor: &EventDescriptor<T>, payload: &T) {
        let value = serde_json::to_value(payload).expect("event payload must be serializable");

        // Send on the per-event channel.
        {
            let mut channels = self.channels.write().await;
            let sender = channels
                .entry(descriptor.id.to_string())
                .or_insert_with(|| broadcast::channel(64).0);
            // Ignore send errors (no active receivers).
            let _ = sender.send(value.clone());
        }

        // Also send on the wildcard channel.
        let _ = self.wildcard.send(EventEnvelope {
            event_id: descriptor.id.to_string(),
            payload: value,
        });
    }

    /// Subscribe to a specific typed event, returning a broadcast receiver.
    pub async fn subscribe<T: DeserializeOwned>(
        &self,
        descriptor: &EventDescriptor<T>,
    ) -> broadcast::Receiver<Value> {
        let mut channels = self.channels.write().await;
        let sender = channels
            .entry(descriptor.id.to_string())
            .or_insert_with(|| broadcast::channel(64).0);
        sender.subscribe()
    }

    /// Subscribe to all events (wildcard listener).
    pub fn listen_all(&self) -> broadcast::Receiver<EventEnvelope> {
        self.wildcard.subscribe()
    }

    /// Register a JSON schema for an event type.
    pub async fn register_event_schema(&self, event_id: &str, schema: Value) {
        self.schemas
            .write()
            .await
            .insert(event_id.to_string(), schema);
    }

    /// Return all registered event schemas.
    pub async fn event_schemas(&self) -> HashMap<String, Value> {
        self.schemas.read().await.clone()
    }

    /// Return all registered event IDs (channel keys).
    pub async fn registered_event_ids(&self) -> Vec<String> {
        self.channels.read().await.keys().cloned().collect()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct TestPayload {
        message: String,
    }

    static TEST_EVENT: EventDescriptor<TestPayload> = EventDescriptor::new("test.event");

    #[tokio::test]
    async fn publish_subscribe_round_trip() {
        let bus = EventBus::new();
        let mut rx = bus.subscribe::<TestPayload>(&TEST_EVENT).await;

        let payload = TestPayload {
            message: "hello".into(),
        };
        bus.publish(&TEST_EVENT, &payload).await;

        let received: Value = rx.recv().await.unwrap();
        let deserialized: TestPayload = serde_json::from_value(received).unwrap();
        assert_eq!(deserialized, payload);
    }

    #[tokio::test]
    async fn wildcard_listener_receives_all() {
        let bus = EventBus::new();
        let mut rx = bus.listen_all();

        let payload = TestPayload {
            message: "wildcard".into(),
        };
        bus.publish(&TEST_EVENT, &payload).await;

        let envelope = rx.recv().await.unwrap();
        assert_eq!(envelope.event_id, "test.event");
        let deserialized: TestPayload = serde_json::from_value(envelope.payload).unwrap();
        assert_eq!(deserialized, payload);
    }

    #[tokio::test]
    async fn register_and_retrieve_event_schemas() {
        let bus = EventBus::new();
        let schema =
            serde_json::json!({"type": "object", "properties": {"id": {"type": "string"}}});
        bus.register_event_schema("test.event", schema.clone())
            .await;

        let schemas = bus.event_schemas().await;
        assert_eq!(schemas.len(), 1);
        assert_eq!(schemas.get("test.event"), Some(&schema));
    }

    #[tokio::test]
    async fn registered_event_ids_returns_channel_keys() {
        let bus = EventBus::new();
        bus.register_event(&TEST_EVENT).await;

        let ids = bus.registered_event_ids().await;
        assert!(ids.contains(&"test.event".to_string()));
    }

    #[tokio::test]
    async fn publish_without_subscribers_does_not_panic() {
        let bus = EventBus::new();
        let payload = TestPayload {
            message: "no one listening".into(),
        };
        // Should not panic.
        bus.publish(&TEST_EVENT, &payload).await;
    }
}

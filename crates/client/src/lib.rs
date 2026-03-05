pub mod error;

use std::collections::HashMap;
use std::sync::Arc;

use futures::stream::StreamExt;
use futures::SinkExt;
use serde_json::Value;
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};
use tokio_tungstenite::tungstenite::Message;

use aperture_protocol::{ClientMessage, ServerMessage};

use crate::error::{ClientError, Result};

/// A clone-friendly event received from the server.
#[derive(Debug, Clone)]
pub struct Event {
    pub event_id: String,
    pub payload: Value,
}

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<std::result::Result<Value, String>>>>>;

pub struct ApertureClient {
    out_tx: mpsc::UnboundedSender<ClientMessage>,
    pending: PendingMap,
    event_tx: broadcast::Sender<Event>,
    _reader_handle: tokio::task::JoinHandle<()>,
    _writer_handle: tokio::task::JoinHandle<()>,
}

impl ApertureClient {
    /// Connect to an Aperture server and perform the Hello handshake.
    pub async fn connect(url: &str, user_id: &str) -> Result<Self> {
        let (ws_stream, _) = tokio_tungstenite::connect_async(url).await?;
        let (mut ws_sink, mut ws_stream_rx) = ws_stream.split();

        // Send Hello.
        let hello = ClientMessage::Hello {
            user_id: user_id.to_string(),
        };
        let hello_json = serde_json::to_string(&hello)?;
        ws_sink.send(Message::Text(hello_json.into())).await?;

        // Wait for HelloAck.
        loop {
            let frame = ws_stream_rx
                .next()
                .await
                .ok_or(ClientError::ConnectionClosed)?
                .map_err(ClientError::WebSocket)?;

            if let Message::Text(text) = frame {
                let msg: ServerMessage = serde_json::from_str(&text)?;
                match msg {
                    ServerMessage::HelloAck { .. } => break,
                    _ => continue,
                }
            }
        }

        // Set up channels.
        let (out_tx, mut out_rx) = mpsc::unbounded_channel::<ClientMessage>();
        let (event_tx, _) = broadcast::channel::<Event>(256);
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));

        // Spawn writer: outbound mpsc → WebSocket sink.
        let writer_handle = tokio::spawn(async move {
            while let Some(msg) = out_rx.recv().await {
                let json = match serde_json::to_string(&msg) {
                    Ok(j) => j,
                    Err(_) => continue,
                };
                if ws_sink.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        });

        // Spawn reader: WebSocket stream → route to event broadcast or pending oneshots.
        let reader_pending = pending.clone();
        let reader_event_tx = event_tx.clone();
        let reader_handle = tokio::spawn(async move {
            while let Some(Ok(frame)) = ws_stream_rx.next().await {
                let text = match frame {
                    Message::Text(t) => t,
                    Message::Close(_) => break,
                    _ => continue,
                };

                let msg: ServerMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                match msg {
                    ServerMessage::Event { event_id, payload } => {
                        let _ = reader_event_tx.send(Event { event_id, payload });
                    }
                    ServerMessage::ActionResult { id, result } => {
                        if let Some(tx) = reader_pending.lock().await.remove(&id) {
                            let _ = tx.send(Ok(result));
                        }
                    }
                    ServerMessage::ActionError { id, error } => {
                        if let Some(tx) = reader_pending.lock().await.remove(&id) {
                            let _ = tx.send(Err(error));
                        }
                    }
                    ServerMessage::HelloAck { .. } => {}
                }
            }
        });

        Ok(Self {
            out_tx,
            pending,
            event_tx,
            _reader_handle: reader_handle,
            _writer_handle: writer_handle,
        })
    }

    /// Invoke an action and wait for the result.
    pub async fn invoke_action(&self, action: &str, input: Value) -> Result<Value> {
        let id = uuid::Uuid::new_v4().to_string();

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id.clone(), tx);

        let msg = ClientMessage::InvokeAction {
            id: id.clone(),
            action: action.to_string(),
            input,
        };

        self.out_tx
            .send(msg)
            .map_err(|_| ClientError::ConnectionClosed)?;

        let result = rx.await.map_err(|_| ClientError::ConnectionClosed)?;

        match result {
            Ok(value) => Ok(value),
            Err(error) => Err(ClientError::ActionError(error)),
        }
    }

    /// Subscribe to all events from the server.
    pub fn events(&self) -> broadcast::Receiver<Event> {
        self.event_tx.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use aperture_protocol::{ClientMessage, ServerMessage};

    #[test]
    fn client_message_serde() {
        let msg = ClientMessage::InvokeAction {
            id: "1".into(),
            action: "test".into(),
            input: serde_json::json!({}),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: ClientMessage = serde_json::from_str(&json).unwrap();
        assert!(matches!(decoded, ClientMessage::InvokeAction { id, .. } if id == "1"));
    }

    #[test]
    fn server_message_serde() {
        let msg = ServerMessage::ActionResult {
            id: "1".into(),
            result: serde_json::json!({"ok": true}),
        };
        let json = serde_json::to_string(&msg).unwrap();
        let decoded: ServerMessage = serde_json::from_str(&json).unwrap();
        assert!(matches!(decoded, ServerMessage::ActionResult { id, .. } if id == "1"));
    }
}

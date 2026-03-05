use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::stream::StreamExt;
use tokio::sync::mpsc;

use aperture_engine::engine::Engine;
use aperture_protocol::{ClientMessage, ServerMessage};

pub struct AppState {
    pub engine: Arc<Engine>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (ws_sender, mut ws_receiver) = socket.split();

    // Channel for serializing outbound writes.
    let (out_tx, out_rx) = mpsc::unbounded_channel::<ServerMessage>();

    // Spawn outbound writer: reads from mpsc → writes to WebSocket sink.
    let writer_handle = tokio::spawn(outbound_writer(ws_sender, out_rx));

    // Wait for Hello message.
    let user_id = match wait_for_hello(&mut ws_receiver).await {
        Some(uid) => uid,
        None => return,
    };

    // Send HelloAck.
    let _ = out_tx.send(ServerMessage::HelloAck {
        user_id: user_id.clone(),
    });

    // Subscribe to all engine events and forward them.
    let mut event_rx = state.engine.events().listen_all();
    let event_out_tx = out_tx.clone();
    let event_handle = tokio::spawn(async move {
        while let Ok(envelope) = event_rx.recv().await {
            let msg = ServerMessage::Event {
                event_id: envelope.event_id,
                payload: envelope.payload,
            };
            if event_out_tx.send(msg).is_err() {
                break;
            }
        }
    });

    // Read loop: parse client messages and dispatch actions.
    while let Some(Ok(frame)) = ws_receiver.next().await {
        let text = match frame {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };

        let client_msg: ClientMessage = match serde_json::from_str(&text) {
            Ok(m) => m,
            Err(_) => continue,
        };

        match client_msg {
            ClientMessage::InvokeAction { id, action, input } => {
                let engine = state.engine.clone();
                let user_id = user_id.clone();
                let tx = out_tx.clone();
                tokio::spawn(async move {
                    let msg = match engine.invoke_action(&action, &user_id, input).await {
                        Ok(result) => ServerMessage::ActionResult { id, result },
                        Err(e) => ServerMessage::ActionError {
                            id,
                            error: e.to_string(),
                        },
                    };
                    let _ = tx.send(msg);
                });
            }
            ClientMessage::Hello { .. } => {
                // Already handled, ignore duplicate hello.
            }
        }
    }

    // Clean up.
    event_handle.abort();
    writer_handle.abort();
}

async fn wait_for_hello(receiver: &mut futures::stream::SplitStream<WebSocket>) -> Option<String> {
    while let Some(Ok(frame)) = receiver.next().await {
        let text = match frame {
            Message::Text(t) => t,
            Message::Close(_) => return None,
            _ => continue,
        };
        match serde_json::from_str::<ClientMessage>(&text) {
            Ok(ClientMessage::Hello { user_id }) => return Some(user_id),
            _ => continue,
        }
    }
    None
}

async fn outbound_writer(
    mut sender: futures::stream::SplitSink<WebSocket, Message>,
    mut rx: mpsc::UnboundedReceiver<ServerMessage>,
) {
    use futures::SinkExt;

    while let Some(msg) = rx.recv().await {
        let json = match serde_json::to_string(&msg) {
            Ok(j) => j,
            Err(_) => continue,
        };
        if sender.send(Message::text(json)).await.is_err() {
            break;
        }
    }
}

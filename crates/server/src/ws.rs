use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures::stream::StreamExt;
use std::time::Duration;
use tokio::sync::{mpsc, Semaphore};

use aperture_engine::engine::Engine;
use aperture_protocol::{ClientMessage, ServerMessage};
use aperture_runtime::AuthService;

pub struct AppState {
    pub engine: Arc<Engine>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.max_message_size(1024 * 1024) // 1 MB
        .on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (ws_sender, mut ws_receiver) = socket.split();

    // Channel for serializing outbound writes.
    let (out_tx, out_rx) = mpsc::unbounded_channel::<ServerMessage>();

    // Spawn outbound writer: reads from mpsc → writes to WebSocket sink.
    let writer_handle = tokio::spawn(outbound_writer(ws_sender, out_rx));

    // Wait for Hello message with token and validate it (30s timeout).
    let hello_result = tokio::time::timeout(
        Duration::from_secs(30),
        wait_for_hello(&mut ws_receiver, &state.engine, &out_tx),
    )
    .await;
    let user_id = match hello_result {
        Ok(Some(uid)) => uid,
        _ => return,
    };

    // Send HelloAck.
    let _ = out_tx.send(ServerMessage::HelloAck {
        user_id: user_id.clone(),
    });

    // Subscribe to engine events and forward only those belonging to this user.
    let mut event_rx = state.engine.events().listen_all();
    let event_out_tx = out_tx.clone();
    let event_user_id = user_id.clone();
    let event_handle = tokio::spawn(async move {
        while let Ok(envelope) = event_rx.recv().await {
            // Only forward events scoped to this user (or unscoped system events).
            if let Some(ref uid) = envelope.user_id {
                if uid != &event_user_id {
                    continue;
                }
            }
            let msg = ServerMessage::Event {
                event_id: envelope.event_id,
                payload: envelope.payload,
            };
            if event_out_tx.send(msg).is_err() {
                break;
            }
        }
    });

    // Cap concurrent in-flight actions per connection.
    let semaphore = Arc::new(Semaphore::new(8));

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
                let sem = semaphore.clone();
                tokio::spawn(async move {
                    let _permit = sem.acquire().await;
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

async fn wait_for_hello(
    receiver: &mut futures::stream::SplitStream<WebSocket>,
    engine: &Engine,
    out_tx: &mpsc::UnboundedSender<ServerMessage>,
) -> Option<String> {
    while let Some(Ok(frame)) = receiver.next().await {
        let text = match frame {
            Message::Text(t) => t,
            Message::Close(_) => return None,
            _ => continue,
        };
        match serde_json::from_str::<ClientMessage>(&text) {
            Ok(ClientMessage::Hello { token }) => {
                let auth = match engine.get_extension::<AuthService>() {
                    Some(a) => a,
                    None => return None,
                };
                match auth.validate_token(&token) {
                    Ok(claims) => return Some(claims.sub),
                    Err(_) => {
                        let _ = out_tx.send(ServerMessage::ActionError {
                            id: "auth".into(),
                            error: "invalid token".into(),
                        });
                        return None;
                    }
                }
            }
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

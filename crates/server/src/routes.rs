use std::sync::Arc;

use axum::Router;
use axum::routing::get;

use crate::schema::schema_handler;
use crate::ws::{ws_handler, AppState};

pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .route("/schema", get(schema_handler))
        .with_state(state)
}

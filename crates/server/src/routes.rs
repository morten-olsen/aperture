use std::sync::Arc;

use axum::routing::{get, post};
use axum::Router;

use crate::auth;
use crate::schema::schema_handler;
use crate::ws::{ws_handler, AppState};

pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .route("/schema", get(schema_handler))
        .route("/auth/login", post(auth::login))
        .route("/auth/me", get(auth::me))
        .with_state(state)
}

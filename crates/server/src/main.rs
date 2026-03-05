mod config;
mod routes;
mod schema;
mod setup;
mod ws;

use std::sync::Arc;

use crate::config::ServerConfig;
use crate::routes::build_router;
use crate::ws::AppState;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    let config = match ServerConfig::from_env() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(2);
        }
    };

    let addr = format!("{}:{}", config.host, config.port);

    let engine = match setup::build_engine(&config).await {
        Ok(e) => e,
        Err(e) => {
            eprintln!("error building engine: {e}");
            std::process::exit(1);
        }
    };

    let state = Arc::new(AppState { engine });
    let router = build_router(state);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| {
            eprintln!("error binding to {addr}: {e}");
            std::process::exit(1);
        });

    eprintln!("aperture-server listening on {addr}");
    axum::serve(listener, router).await.unwrap_or_else(|e| {
        eprintln!("server error: {e}");
        std::process::exit(1);
    });
}

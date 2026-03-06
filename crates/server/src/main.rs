mod auth;
mod config;
mod routes;
mod schema;
mod setup;
mod ws;

use std::sync::Arc;

use clap::{Parser, Subcommand};

use crate::config::ServerConfig;
use crate::routes::build_router;
use crate::ws::AppState;

#[derive(Parser)]
#[command(name = "aperture-server")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the HTTP/WebSocket server
    Serve,
    /// Manage users
    User {
        #[command(subcommand)]
        action: UserAction,
    },
    /// Manage secrets
    Secret {
        #[command(subcommand)]
        action: SecretAction,
    },
}

#[derive(Subcommand)]
enum UserAction {
    /// Create a new user
    Create {
        username: String,
        /// Prompt for a password
        #[arg(long)]
        password: bool,
    },
    /// List all users
    List,
    /// Delete a user
    Delete { username: String },
    /// Set a user's password
    SetPassword { username: String },
}

#[derive(Subcommand)]
enum SecretAction {
    /// Add or update a secret
    Add {
        user_id: String,
        secret_id: String,
        /// Human-readable name for the secret
        #[arg(long)]
        name: Option<String>,
    },
    /// Remove a secret
    Remove { user_id: String, secret_id: String },
    /// List secrets for a user
    List { user_id: String },
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    let cli = Cli::parse();

    match cli.command.unwrap_or(Commands::Serve) {
        Commands::Serve => run_serve().await,
        Commands::User { action } => run_user(action).await,
        Commands::Secret { action } => run_secret(action).await,
    }
}

async fn run_serve() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("aperture=info".parse().expect("valid filter directive")),
        )
        .json()
        .init();

    let config = match ServerConfig::from_env() {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "configuration error");
            std::process::exit(2);
        }
    };

    let addr = format!("{}:{}", config.host, config.port);

    let engine = match setup::build_engine(&config).await {
        Ok(e) => e,
        Err(e) => {
            tracing::error!(error = %e, "error building engine");
            std::process::exit(1);
        }
    };

    let state = Arc::new(AppState { engine });
    let router = build_router(state);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| {
            tracing::error!(addr = %addr, error = %e, "error binding listener");
            std::process::exit(1);
        });

    tracing::info!(addr = %addr, "aperture-server listening");
    axum::serve(listener, router).await.unwrap_or_else(|e| {
        tracing::error!(error = %e, "server error");
        std::process::exit(1);
    });
}

async fn run_user(action: UserAction) {
    use aperture_engine::engine::Engine;
    use aperture_runtime::{
        AuthPlugin, AuthService, DatabasePlugin, RuntimeConfig, RuntimeConfigPlugin,
    };

    // Build minimal engine with just config + database + auth.
    let mut engine = Engine::new();
    if let Err(e) = engine
        .register(Box::new(RuntimeConfigPlugin::new(RuntimeConfig::default())))
        .await
    {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
    if let Err(e) = engine.register(Box::new(DatabasePlugin)).await {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
    if let Err(e) = engine.register(Box::new(AuthPlugin)).await {
        eprintln!("error: {e}");
        std::process::exit(1);
    }

    let auth = match engine.get_extension::<AuthService>() {
        Some(a) => a.clone(),
        None => {
            eprintln!("error: auth service not available");
            std::process::exit(1);
        }
    };

    match action {
        UserAction::Create { username, password } => {
            let pw = if password {
                eprint!("Password: ");
                let p = rpassword::read_password().unwrap_or_else(|e| {
                    eprintln!("error reading password: {e}");
                    std::process::exit(1);
                });
                Some(p)
            } else {
                None
            };

            match auth.create_user(&username, pw.as_deref()).await {
                Ok(user) => println!("created user: {} (id: {})", user.username, user.id),
                Err(e) => {
                    eprintln!("error: {e}");
                    std::process::exit(1);
                }
            }
        }
        UserAction::List => match auth.list_users().await {
            Ok(users) => {
                if users.is_empty() {
                    println!("no users");
                } else {
                    for user in users {
                        let has_pw = if user.password_hash.is_some() {
                            "has password"
                        } else {
                            "no password"
                        };
                        println!(
                            "{} (id: {}, {}, created: {})",
                            user.username, user.id, has_pw, user.created_at
                        );
                    }
                }
            }
            Err(e) => {
                eprintln!("error: {e}");
                std::process::exit(1);
            }
        },
        UserAction::Delete { username } => {
            let user = match auth.get_user_by_username(&username).await {
                Ok(Some(u)) => u,
                Ok(None) => {
                    eprintln!("error: user '{username}' not found");
                    std::process::exit(1);
                }
                Err(e) => {
                    eprintln!("error: {e}");
                    std::process::exit(1);
                }
            };
            match auth.delete_user(&user.id).await {
                Ok(()) => println!("deleted user: {username}"),
                Err(e) => {
                    eprintln!("error: {e}");
                    std::process::exit(1);
                }
            }
        }
        UserAction::SetPassword { username } => {
            let user = match auth.get_user_by_username(&username).await {
                Ok(Some(u)) => u,
                Ok(None) => {
                    eprintln!("error: user '{username}' not found");
                    std::process::exit(1);
                }
                Err(e) => {
                    eprintln!("error: {e}");
                    std::process::exit(1);
                }
            };
            eprint!("New password: ");
            let pw = rpassword::read_password().unwrap_or_else(|e| {
                eprintln!("error reading password: {e}");
                std::process::exit(1);
            });
            match auth.set_password(&user.id, &pw).await {
                Ok(()) => println!("password updated for {username}"),
                Err(e) => {
                    eprintln!("error: {e}");
                    std::process::exit(1);
                }
            }
        }
    }
}

async fn run_secret(action: SecretAction) {
    use aperture_engine::engine::Engine;
    use aperture_runtime::{RuntimeConfig, RuntimeConfigPlugin, SecretPlugin, SecretStore};

    let mut engine = Engine::new();
    if let Err(e) = engine
        .register(Box::new(RuntimeConfigPlugin::new(RuntimeConfig::default())))
        .await
    {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
    if let Err(e) = engine.register(Box::new(SecretPlugin)).await {
        eprintln!("error: {e}");
        std::process::exit(1);
    }

    let store = match engine.get_extension::<SecretStore>() {
        Some(s) => s.clone(),
        None => {
            eprintln!("error: secret store not available");
            std::process::exit(1);
        }
    };

    match action {
        SecretAction::Add {
            user_id,
            secret_id,
            name,
        } => {
            let display_name = name.unwrap_or_else(|| secret_id.clone());
            eprint!("Secret value: ");
            let value = rpassword::read_password().unwrap_or_else(|e| {
                eprintln!("error reading secret: {e}");
                std::process::exit(1);
            });
            match store.add(&user_id, &secret_id, &display_name, &value) {
                Ok(()) => println!("secret '{secret_id}' added for user '{user_id}'"),
                Err(e) => {
                    eprintln!("error: {e}");
                    std::process::exit(1);
                }
            }
        }
        SecretAction::Remove { user_id, secret_id } => match store.remove(&user_id, &secret_id) {
            Ok(true) => println!("secret '{secret_id}' removed for user '{user_id}'"),
            Ok(false) => {
                eprintln!("secret '{secret_id}' not found for user '{user_id}'");
                std::process::exit(1);
            }
            Err(e) => {
                eprintln!("error: {e}");
                std::process::exit(1);
            }
        },
        SecretAction::List { user_id } => match store.list(&user_id) {
            Ok(secrets) => {
                if secrets.is_empty() {
                    println!("no secrets for user '{user_id}'");
                } else {
                    for s in secrets {
                        println!("{} ({})", s.id, s.name);
                    }
                }
            }
            Err(e) => {
                eprintln!("error: {e}");
                std::process::exit(1);
            }
        },
    }
}

mod app;
mod config;
mod ui;

use std::io::{self, BufRead, Write as _};
use std::sync::Arc;

use crossterm::event::{Event, EventStream, KeyCode, KeyEventKind, KeyModifiers, MouseEventKind};
use futures::StreamExt;
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;
use serde_json::{json, Value};
use tokio::sync::mpsc;

use aperture_client::ApertureClient;
use app::App;
use config::{config_path, load_config, save_config, CliConfig};

const USAGE: &str = "\
Usage: aperture-cli [OPTIONS] [PROMPT]
       aperture-cli auth [login | logout | status]

  PROMPT  If provided, send a single message and exit.
          If omitted, start interactive TUI mode.

Options:
  --url <URL>           Server base URL (e.g. http://localhost:3000)
                        Uses config file default if omitted.
  --conversation <ID>   Conversation ID (creates new if omitted)
  --json                Output full prompt result as JSON (one-shot mode)
  --help                Print this help message

Exit Codes:
  0   Success
  1   Error
  2   Usage error
  3   Prompt paused waiting for approval";

struct Args {
    url: String,
    token: String,
    conversation_id: Option<String>,
    json_output: bool,
    prompt: Option<String>,
}

enum Command {
    Run(Args),
    Auth(Vec<String>),
}

fn parse_args() -> Result<Command, String> {
    let mut args = std::env::args().skip(1).peekable();
    let mut url: Option<String> = None;
    let mut conversation_id = None;
    let mut json_output = false;
    let mut positional = Vec::new();

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--help" | "-h" => {
                println!("{USAGE}");
                std::process::exit(0);
            }
            "--json" => json_output = true,
            "--url" => {
                url = Some(
                    args.next()
                        .ok_or_else(|| "--url requires a value".to_string())?,
                );
            }
            "--conversation" => {
                conversation_id = Some(
                    args.next()
                        .ok_or_else(|| "--conversation requires a value".to_string())?,
                );
            }
            other if other.starts_with('-') => {
                return Err(format!("unknown option: {other}"));
            }
            _ => positional.push(arg),
        }
    }

    // Detect auth subcommand.
    if positional.first().map(|s| s.as_str()) == Some("auth") {
        return Ok(Command::Auth(positional[1..].to_vec()));
    }

    // Load config file, then merge with CLI flags.
    let config = load_config();

    // Resolve URL: --url flag > config file > error.
    let url = url.or(config.url).ok_or_else(|| {
        "no server URL configured\n\nRun `aperture-cli auth login` to configure, or pass --url <URL>."
            .to_string()
    })?;

    let token = config.token.ok_or_else(|| {
        "not logged in\n\nRun `aperture-cli auth login` to authenticate.".to_string()
    })?;

    let prompt = if positional.is_empty() {
        None
    } else {
        Some(positional.join(" "))
    };

    Ok(Command::Run(Args {
        url,
        token,
        conversation_id,
        json_output,
        prompt,
    }))
}

#[tokio::main]
async fn main() {
    let command = match parse_args() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("error: {e}\n\n{USAGE}");
            std::process::exit(2);
        }
    };

    match command {
        Command::Auth(sub_args) => {
            if let Err(e) = run_auth(sub_args).await {
                eprintln!("error: {e}");
                std::process::exit(1);
            }
        }
        Command::Run(args) => {
            if let Err(e) = run(args).await {
                eprintln!("error: {e}");
                std::process::exit(1);
            }
        }
    }
}

// ── Auth subcommand ─────────────────────────────────────────────────

async fn run_auth(sub_args: Vec<String>) -> Result<(), String> {
    match sub_args.first().map(|s| s.as_str()) {
        None | Some("login") => auth_login().await,
        Some("logout") => auth_logout(),
        Some("status") => auth_status().await,
        Some(other) => Err(format!("unknown auth subcommand: {other}")),
    }
}

async fn auth_login() -> Result<(), String> {
    let config = load_config();
    let path = config_path();
    println!("Aperture CLI login ({})\n", path.display());

    let url = prompt_field(
        "Server URL",
        config.url.as_deref().unwrap_or("http://localhost:3000"),
    );
    let username = prompt_field("Username", "");
    let password = prompt_password("Password");

    let resp = ApertureClient::login(&url, &username, &password)
        .await
        .map_err(|e| format!("login failed: {e}"))?;

    let new_config = CliConfig {
        url: Some(url),
        token: Some(resp.token),
    };
    save_config(&new_config)?;

    println!(
        "\nLogged in as {} (id: {})",
        resp.user.username, resp.user.id
    );
    Ok(())
}

fn auth_logout() -> Result<(), String> {
    let mut config = load_config();
    config.token = None;
    save_config(&config)?;
    println!("Logged out.");
    Ok(())
}

async fn auth_status() -> Result<(), String> {
    let config = load_config();

    let url = config.url.as_deref().ok_or("no server URL configured")?;
    let token = config.token.as_deref().ok_or("not logged in")?;

    let user = ApertureClient::me(url, token)
        .await
        .map_err(|e| format!("status check failed: {e}"))?;

    println!("Logged in as {} (id: {})", user.username, user.id);
    println!("Server: {url}");
    Ok(())
}

fn prompt_field(label: &str, default: &str) -> String {
    if default.is_empty() {
        print!("{label}: ");
    } else {
        print!("{label} [{default}]: ");
    }
    io::stdout().flush().ok();
    let mut line = String::new();
    io::stdin().lock().read_line(&mut line).ok();
    let trimmed = line.trim();
    if trimmed.is_empty() {
        default.to_string()
    } else {
        trimmed.to_string()
    }
}

fn prompt_password(label: &str) -> String {
    eprint!("{label}: ");
    rpassword::read_password().unwrap_or_default()
}

// ── Run ─────────────────────────────────────────────────────────────

async fn run(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    let client = Arc::new(ApertureClient::connect(&args.url, &args.token).await?);

    let conversation_id = match args.conversation_id {
        Some(id) => id,
        None => {
            let result = client
                .invoke_action("create_conversation", json!({}))
                .await?;
            result["conversation_id"]
                .as_str()
                .ok_or("missing conversation_id in response")?
                .to_string()
        }
    };

    match args.prompt {
        Some(prompt) => run_oneshot(&client, &conversation_id, &prompt, args.json_output).await,
        None => run_interactive(client, conversation_id).await,
    }
}

// ── One-shot mode ───────────────────────────────────────────────────

async fn run_oneshot(
    client: &ApertureClient,
    conversation_id: &str,
    prompt: &str,
    json_output: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut result = client
        .invoke_action(
            "send_message",
            json!({
                "conversation_id": conversation_id,
                "message": prompt,
            }),
        )
        .await?;

    loop {
        if json_output {
            println!("{}", serde_json::to_string_pretty(&result)?);
        } else {
            print_human(&result);
        }

        if result["state"].as_str() != Some("waiting_for_approval") {
            break;
        }

        let prompt_id = match result["id"].as_str() {
            Some(id) => id.to_string(),
            None => {
                eprintln!("error: prompt missing id, cannot approve/reject");
                std::process::exit(3);
            }
        };

        eprint!("Approve? [y/n] ");
        io::stdout().flush().ok();
        let mut line = String::new();
        io::stdin().lock().read_line(&mut line).ok();

        let answer = line.trim().to_lowercase();
        result = if answer == "y" || answer == "yes" {
            client
                .invoke_action(
                    "approve_prompt",
                    json!({
                        "conversation_id": conversation_id,
                        "prompt_id": prompt_id,
                    }),
                )
                .await?
        } else {
            client
                .invoke_action(
                    "reject_prompt",
                    json!({
                        "conversation_id": conversation_id,
                        "prompt_id": prompt_id,
                        "reason": "user rejected",
                    }),
                )
                .await?
        };
    }

    Ok(())
}

fn print_human(prompt: &Value) {
    let outputs = match prompt["output"].as_array() {
        Some(arr) => arr,
        None => return,
    };

    for output in outputs {
        match output["type"].as_str() {
            Some("text") => {
                if let Some(content) = output["content"].as_str() {
                    println!("{content}");
                }
            }
            Some("tool") => {
                let tool_id = output["tool_id"].as_str().unwrap_or("?");
                eprintln!("[tool: {tool_id}]");
                eprintln!("  input:  {}", output["input"]);
                if let Some(result) = output.get("result") {
                    if !result.is_null() {
                        match result["status"].as_str() {
                            Some("success") => eprintln!("  result: {}", result["output"]),
                            Some("error") => eprintln!("  error:  {}", result["error"]),
                            Some("pending") => eprintln!("  pending: {}", result["reason"]),
                            _ => {}
                        }
                    }
                }
            }
            Some("file") => {
                let path = output["path"].as_str().unwrap_or("?");
                let content = output["content"].as_str().unwrap_or("");
                eprintln!("[file: {path}]");
                eprintln!("  {content}");
            }
            _ => {}
        }
    }

    if prompt["state"].as_str() == Some("waiting_for_approval") {
        eprintln!("(paused — waiting for approval)");
    }

    if let Some(usage) = prompt.get("usage") {
        let pt = usage["prompt_tokens"].as_u64().unwrap_or(0);
        let ct = usage["completion_tokens"].as_u64().unwrap_or(0);
        let tt = usage["total_tokens"].as_u64().unwrap_or(0);
        eprintln!("tokens: {pt} prompt + {ct} completion = {tt} total");
    }
}

// ── Interactive TUI mode ────────────────────────────────────────────

async fn run_interactive(
    client: Arc<ApertureClient>,
    conversation_id: String,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut app = App::new(conversation_id);
    let mut server_events = client.events();
    let (err_tx, mut err_rx) = mpsc::unbounded_channel::<String>();
    let (result_tx, mut result_rx) = mpsc::unbounded_channel::<Value>();

    crossterm::terminal::enable_raw_mode()?;
    crossterm::execute!(
        io::stdout(),
        crossterm::terminal::EnterAlternateScreen,
        crossterm::event::EnableMouseCapture,
    )?;
    let backend = CrosstermBackend::new(io::stdout());
    let mut terminal = Terminal::new(backend)?;
    terminal.clear()?;

    let mut term_events = EventStream::new();

    loop {
        terminal.draw(|f| ui::render(f, &app))?;

        tokio::select! {
            Some(Ok(evt)) = term_events.next() => {
                match evt {
                    Event::Key(key) if key.kind == KeyEventKind::Press => {
                        match key.code {
                            KeyCode::Esc => app.should_quit = true,
                            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                                app.should_quit = true;
                            }
                            KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                                app.input.clear();
                            }
                            KeyCode::Char('w') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                                let end = app.input.trim_end().len();
                                if let Some(pos) = app.input[..end].rfind(' ') {
                                    app.input.truncate(pos + 1);
                                } else {
                                    app.input.clear();
                                }
                            }
                            KeyCode::Enter => {
                                if let Some(message) = app.send_message() {
                                    let c = client.clone();
                                    let conv_id = app.conversation_id.clone();
                                    let tx_err = err_tx.clone();
                                    let tx_ok = result_tx.clone();
                                    tokio::spawn(async move {
                                        match c
                                            .invoke_action(
                                                "send_message",
                                                json!({
                                                    "conversation_id": conv_id,
                                                    "message": message,
                                                }),
                                            )
                                            .await
                                        {
                                            Ok(result) => {
                                                let _ = tx_ok.send(result);
                                            }
                                            Err(e) => {
                                                let _ = tx_err.send(format!("send failed: {e}"));
                                            }
                                        }
                                    });
                                }
                            }
                            KeyCode::Char('y') if matches!(app.status, app::Status::WaitingForApproval { .. }) => {
                                if let Some((action, payload)) = app.approve() {
                                    let c = client.clone();
                                    let tx_err = err_tx.clone();
                                    let tx_ok = result_tx.clone();
                                    tokio::spawn(async move {
                                        match c.invoke_action(&action, payload).await {
                                            Ok(result) => { let _ = tx_ok.send(result); }
                                            Err(e) => { let _ = tx_err.send(format!("approve failed: {e}")); }
                                        }
                                    });
                                }
                            }
                            KeyCode::Char('n') if matches!(app.status, app::Status::WaitingForApproval { .. }) => {
                                if let Some((action, payload)) = app.reject() {
                                    let c = client.clone();
                                    let tx_err = err_tx.clone();
                                    let tx_ok = result_tx.clone();
                                    tokio::spawn(async move {
                                        match c.invoke_action(&action, payload).await {
                                            Ok(result) => { let _ = tx_ok.send(result); }
                                            Err(e) => { let _ = tx_err.send(format!("reject failed: {e}")); }
                                        }
                                    });
                                }
                            }
                            KeyCode::Char(c) => app.input.push(c),
                            KeyCode::Backspace => {
                                app.input.pop();
                            }
                            KeyCode::Up => app.scroll_up(1),
                            KeyCode::Down => app.scroll_down(1),
                            KeyCode::PageUp => app.scroll_up(10),
                            KeyCode::PageDown => app.scroll_down(10),
                            _ => {}
                        }
                    }
                    Event::Mouse(mouse) => {
                        match mouse.kind {
                            MouseEventKind::ScrollUp => app.scroll_up(3),
                            MouseEventKind::ScrollDown => app.scroll_down(3),
                            _ => {}
                        }
                    }
                    _ => {}
                }
            }
            Ok(event) = server_events.recv() => {
                app.handle_event(&event.event_id, &event.payload);
            }
            Some(result) = result_rx.recv() => {
                app.handle_action_result(&result);
            }
            Some(error) = err_rx.recv() => {
                app.handle_error(error);
            }
        }

        if app.should_quit {
            break;
        }
    }

    crossterm::terminal::disable_raw_mode()?;
    crossterm::execute!(
        io::stdout(),
        crossterm::terminal::LeaveAlternateScreen,
        crossterm::event::DisableMouseCapture,
    )?;

    Ok(())
}

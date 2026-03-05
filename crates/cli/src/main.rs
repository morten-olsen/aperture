mod app;
mod config;
mod ui;

use std::io::{self, BufRead, Write as _};
use std::sync::Arc;

use crossterm::event::{Event, EventStream, KeyCode, KeyEventKind, KeyModifiers};
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
       aperture-cli config [show | set <key> <value> | path]

  PROMPT  If provided, send a single message and exit.
          If omitted, start interactive TUI mode.

Options:
  --url <URL>           Server WebSocket URL (e.g. ws://localhost:3000/ws)
                        Uses config file default if omitted.
  --user <ID>           User ID (default: cli-user)
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
    user_id: String,
    conversation_id: Option<String>,
    json_output: bool,
    prompt: Option<String>,
}

enum Command {
    Run(Args),
    Config(Vec<String>),
}

fn parse_args() -> Result<Command, String> {
    let mut args = std::env::args().skip(1).peekable();
    let mut url: Option<String> = None;
    let mut user_id: Option<String> = None;
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
            "--user" => {
                user_id = Some(
                    args.next()
                        .ok_or_else(|| "--user requires a value".to_string())?,
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

    // Detect config subcommand.
    if positional.first().map(|s| s.as_str()) == Some("config") {
        return Ok(Command::Config(positional[1..].to_vec()));
    }

    // Load config file, then merge with CLI flags.
    let config = load_config();

    // Resolve URL: --url flag > config file > error.
    let url = url.or(config.url).ok_or_else(|| {
        "no server URL configured\n\nRun `aperture-cli config` to set a default URL, or pass --url <URL>."
            .to_string()
    })?;

    let user_id = user_id
        .or(config.user)
        .unwrap_or_else(|| "cli-user".to_string());

    let prompt = if positional.is_empty() {
        None
    } else {
        Some(positional.join(" "))
    };

    Ok(Command::Run(Args {
        url,
        user_id,
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
        Command::Config(sub_args) => {
            if let Err(e) = run_config(sub_args) {
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

// ── Config subcommand ───────────────────────────────────────────────

fn run_config(sub_args: Vec<String>) -> Result<(), String> {
    match sub_args.first().map(|s| s.as_str()) {
        None => config_interactive(),
        Some("show") => config_show(),
        Some("set") => config_set(&sub_args[1..]),
        Some("path") => {
            println!("{}", config_path().display());
            Ok(())
        }
        Some(other) => Err(format!("unknown config subcommand: {other}")),
    }
}

fn config_interactive() -> Result<(), String> {
    let config = load_config();
    let path = config_path();

    println!(
        "Aperture CLI configuration ({})\n",
        path.display()
    );

    let url = prompt_field(
        "Server URL",
        config.url.as_deref().unwrap_or("ws://localhost:3000/ws"),
    );
    let user = prompt_field(
        "User ID",
        config.user.as_deref().unwrap_or("cli-user"),
    );

    let new_config = CliConfig {
        url: Some(url),
        user: Some(user),
    };
    save_config(&new_config)?;
    println!("\nConfiguration saved.");
    Ok(())
}

fn prompt_field(label: &str, default: &str) -> String {
    print!("{label} [{default}]: ");
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

fn config_show() -> Result<(), String> {
    let path = config_path();
    println!("Config file: {}\n", path.display());
    if !path.exists() {
        println!("No config file found.");
        return Ok(());
    }
    let config = load_config();
    if let Some(url) = &config.url {
        println!("url  = {url}");
    }
    if let Some(user) = &config.user {
        println!("user = {user}");
    }
    if config.url.is_none() && config.user.is_none() {
        println!("(empty)");
    }
    Ok(())
}

fn config_set(args: &[String]) -> Result<(), String> {
    if args.len() != 2 {
        return Err("usage: aperture-cli config set <key> <value>".to_string());
    }
    let key = &args[0];
    let value = &args[1];
    let mut config = load_config();
    match key.as_str() {
        "url" => config.url = Some(value.clone()),
        "user" => config.user = Some(value.clone()),
        _ => return Err(format!("unknown config key: {key} (valid keys: url, user)")),
    }
    save_config(&config)?;
    Ok(())
}

// ── Run ─────────────────────────────────────────────────────────────

async fn run(args: Args) -> Result<(), Box<dyn std::error::Error>> {
    let client = Arc::new(ApertureClient::connect(&args.url, &args.user_id).await?);

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
    let result = client
        .invoke_action(
            "send_message",
            json!({
                "conversation_id": conversation_id,
                "message": prompt,
            }),
        )
        .await?;

    if json_output {
        println!("{}", serde_json::to_string_pretty(&result)?);
    } else {
        print_human(&result);
    }

    if result["state"].as_str() == Some("waiting_for_approval") {
        std::process::exit(3);
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

    crossterm::terminal::enable_raw_mode()?;
    crossterm::execute!(io::stdout(), crossterm::terminal::EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(io::stdout());
    let mut terminal = Terminal::new(backend)?;
    terminal.clear()?;

    let mut term_events = EventStream::new();

    loop {
        terminal.draw(|f| ui::render(f, &app))?;

        tokio::select! {
            Some(Ok(evt)) = term_events.next() => {
                if let Event::Key(key) = evt {
                    if key.kind != KeyEventKind::Press {
                        continue;
                    }
                    match key.code {
                        KeyCode::Esc => app.should_quit = true,
                        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                            app.should_quit = true;
                        }
                        KeyCode::Enter => {
                            if let Some(message) = app.send_message() {
                                let c = client.clone();
                                let conv_id = app.conversation_id.clone();
                                let tx = err_tx.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = c
                                        .invoke_action(
                                            "send_message",
                                            json!({
                                                "conversation_id": conv_id,
                                                "message": message,
                                            }),
                                        )
                                        .await
                                    {
                                        let _ = tx.send(format!("send failed: {e}"));
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
            }
            Ok(event) = server_events.recv() => {
                app.handle_event(&event.event_id, &event.payload);
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
    crossterm::execute!(io::stdout(), crossterm::terminal::LeaveAlternateScreen)?;

    Ok(())
}

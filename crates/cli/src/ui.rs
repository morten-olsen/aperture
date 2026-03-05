use ratatui::{
    layout::{Constraint, Direction, Layout, Position, Rect},
    style::{Color, Style},
    text::{Line, Span, Text},
    widgets::{Block, Paragraph, Wrap},
    Frame,
};

use crate::app::{App, Role, Status};

pub fn render(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),
            Constraint::Length(3),
            Constraint::Length(1),
        ])
        .split(f.area());

    render_messages(f, app, chunks[0]);
    render_input(f, app, chunks[1]);
    render_status(f, app, chunks[2]);
}

fn render_messages(f: &mut Frame, app: &App, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();

    for msg in &app.messages {
        match msg.role {
            Role::User => {
                lines.push(Line::from(Span::styled(
                    format!("> {}", msg.content),
                    Style::default().fg(Color::Green),
                )));
            }
            Role::Assistant => {
                for text_line in msg.content.lines() {
                    lines.push(Line::from(text_line.to_string()));
                }
            }
            Role::System => {
                lines.push(Line::from(Span::styled(
                    msg.content.clone(),
                    Style::default().fg(Color::Yellow),
                )));
            }
        }
        lines.push(Line::from(""));
    }

    if app.status == Status::Waiting {
        lines.push(Line::from(Span::styled(
            "thinking...",
            Style::default().fg(Color::DarkGray),
        )));
    }

    let short_id: String = app.conversation_id.chars().take(8).collect();

    let text = Text::from(lines);

    // Auto-scroll to bottom, offset by user's manual scroll.
    let inner_height = area.height.saturating_sub(2);
    let content_height = estimate_wrapped_height(&text, area.width.saturating_sub(2));
    let max_scroll = content_height.saturating_sub(inner_height);
    let scroll_pos = max_scroll.saturating_sub(app.scroll_offset);

    let messages = Paragraph::new(text)
        .block(Block::bordered().title(format!(" Aperture — conv: {short_id} ")))
        .wrap(Wrap { trim: false })
        .scroll((scroll_pos, 0));

    f.render_widget(messages, area);
}

/// Approximate the number of terminal rows the text will occupy after wrapping.
fn estimate_wrapped_height(text: &Text, width: u16) -> u16 {
    let w = width.max(1) as usize;
    text.lines
        .iter()
        .map(|line| {
            let line_w = line.width();
            if line_w == 0 {
                1
            } else {
                line_w.div_ceil(w) as u16
            }
        })
        .sum()
}

fn render_input(f: &mut Frame, app: &App, area: Rect) {
    let title = if app.status == Status::Waiting {
        " Waiting... "
    } else {
        " > "
    };

    let input = Paragraph::new(app.input.as_str())
        .block(Block::bordered().title(title));

    f.render_widget(input, area);

    if app.status != Status::Waiting {
        let cursor_x = area.x + 1 + (app.input.len() as u16).min(area.width.saturating_sub(2));
        let cursor_y = area.y + 1;
        f.set_cursor_position(Position::new(cursor_x, cursor_y));
    }
}

fn render_status(f: &mut Frame, app: &App, area: Rect) {
    let (indicator, label) = match app.status {
        Status::Connected => ("●", "connected"),
        Status::Waiting => ("◌", "waiting"),
    };

    let total = app.total_usage.prompt_tokens + app.total_usage.completion_tokens;
    let text = if total > 0 {
        format!(
            " {} {}  │  {}+{} tokens  │  Esc quit",
            indicator, label, app.total_usage.prompt_tokens, app.total_usage.completion_tokens,
        )
    } else {
        format!(" {} {}  │  Esc quit", indicator, label)
    };

    let status = Paragraph::new(text).style(Style::default().fg(Color::DarkGray));
    f.render_widget(status, area);
}

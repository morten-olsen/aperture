use ratatui::{
    layout::{Constraint, Direction, Layout, Margin, Position, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{
        Block, BorderType, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState, Wrap,
    },
    Frame,
};

use crate::app::{App, Role, Status};

// ── Palette (256-color) ─────────────────────────────────────────────

const BORDER: Color = Color::Indexed(237);
const ACCENT: Color = Color::Indexed(75);
const USER: Color = Color::Indexed(114);
const SYSTEM: Color = Color::Indexed(214);
const DIM: Color = Color::Indexed(242);
const FAINT: Color = Color::Indexed(238);
const TOOL: Color = Color::Indexed(103);
const TOOL_OK: Color = Color::Indexed(108);
const TOOL_ERR: Color = Color::Indexed(167);
const SEPARATOR: Color = Color::Indexed(236);
const SCROLL_THUMB: Color = Color::Indexed(240);
const SCROLL_TRACK: Color = Color::Indexed(235);

const MAX_INPUT_LINES: u16 = 5;

pub fn render(f: &mut Frame, app: &App) {
    let width = f.area().width;
    let input_inner_w = width.saturating_sub(2).max(1);
    let input_visual_w = Line::from(app.input.as_str()).width() as u16;
    let input_rows = if input_visual_w == 0 {
        1
    } else {
        input_visual_w.div_ceil(input_inner_w)
    };
    let input_height = (input_rows + 2).clamp(3, MAX_INPUT_LINES + 2);

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(3),
            Constraint::Length(input_height),
            Constraint::Length(1),
        ])
        .split(f.area());

    render_messages(f, app, chunks[0]);
    render_input(f, app, chunks[1]);
    render_status(f, app, chunks[2]);
}

// ── Messages ────────────────────────────────────────────────────────

fn render_messages(f: &mut Frame, app: &App, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();

    for (i, msg) in app.messages.iter().enumerate() {
        if i > 0 {
            lines.push(Line::from(""));
        }
        match msg.role {
            Role::User => {
                lines.push(Line::from(vec![
                    Span::styled("  you ▸ ", Style::default().fg(USER)),
                    Span::raw(&msg.content),
                ]));
            }
            Role::Assistant => {
                for text_line in msg.content.lines() {
                    if text_line.starts_with("[tool: ") {
                        render_tool_line(text_line, &mut lines);
                    } else if text_line.starts_with("[file: ") {
                        lines.push(Line::from(Span::styled(
                            format!("  {text_line}"),
                            Style::default().fg(DIM),
                        )));
                    } else {
                        lines.push(Line::from(format!("  {text_line}")));
                    }
                }
            }
            Role::System => {
                lines.push(Line::from(vec![
                    Span::styled("  ⚠ ", Style::default().fg(SYSTEM)),
                    Span::styled(msg.content.as_str(), Style::default().fg(SYSTEM)),
                ]));
            }
        }
    }

    match &app.status {
        Status::Waiting => {
            if !lines.is_empty() {
                lines.push(Line::from(""));
            }
            lines.push(Line::from(Span::styled(
                "  ◇ thinking…",
                Style::default().fg(DIM),
            )));
        }
        Status::WaitingForApproval { .. } => {
            if !lines.is_empty() {
                lines.push(Line::from(""));
            }
            lines.push(Line::from(vec![
                Span::styled("  ⚠ ", Style::default().fg(SYSTEM)),
                Span::styled(
                    "Tool requires approval. Press y to approve, n to reject.",
                    Style::default().fg(SYSTEM),
                ),
            ]));
        }
        Status::Connected => {}
    }

    let short_id: String = app.conversation_id.chars().take(8).collect();

    let text = Text::from(lines);
    let inner_h = area.height.saturating_sub(2);
    let content_h = estimate_wrapped_height(&text, area.width.saturating_sub(2));
    let max_scroll = content_h.saturating_sub(inner_h);
    let scroll_pos = max_scroll.saturating_sub(app.scroll_offset);

    let block = Block::bordered()
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(BORDER))
        .title(Span::styled(
            " aperture ",
            Style::default().fg(ACCENT).add_modifier(Modifier::BOLD),
        ))
        .title_bottom(
            Line::from(Span::styled(
                format!(" {short_id} "),
                Style::default().fg(FAINT),
            ))
            .right_aligned(),
        );

    let messages = Paragraph::new(text)
        .block(block)
        .wrap(Wrap { trim: false })
        .scroll((scroll_pos, 0));

    f.render_widget(messages, area);

    // Scrollbar (only when content overflows).
    if max_scroll > 0 {
        let mut sb_state = ScrollbarState::new(max_scroll as usize).position(scroll_pos as usize);
        let scrollbar = Scrollbar::new(ScrollbarOrientation::VerticalRight)
            .thumb_style(Style::default().fg(SCROLL_THUMB))
            .track_style(Style::default().fg(SCROLL_TRACK))
            .begin_symbol(None)
            .end_symbol(None);
        f.render_stateful_widget(
            scrollbar,
            area.inner(Margin {
                horizontal: 0,
                vertical: 1,
            }),
            &mut sb_state,
        );
    }
}

fn render_tool_line(raw: &str, lines: &mut Vec<Line>) {
    // Parse "[tool: tool_id] status"
    let inner = raw.trim_start_matches("[tool: ");
    let (tool_id, status) = match inner.split_once("] ") {
        Some((id, s)) => (id.to_string(), s),
        None => {
            lines.push(Line::from(format!("  {raw}")));
            return;
        }
    };

    let (icon, icon_color) = match status {
        "ok" => ("✓", TOOL_OK),
        "err" => ("✗", TOOL_ERR),
        _ => ("…", DIM),
    };

    lines.push(Line::from(vec![
        Span::styled("  ┄ ", Style::default().fg(FAINT)),
        Span::styled(tool_id, Style::default().fg(TOOL)),
        Span::raw(" "),
        Span::styled(icon, Style::default().fg(icon_color)),
    ]));
}

// ── Input ───────────────────────────────────────────────────────────

fn render_input(f: &mut Frame, app: &App, area: Rect) {
    let is_busy = matches!(
        app.status,
        Status::Waiting | Status::WaitingForApproval { .. }
    );
    let title_style = if is_busy {
        Style::default().fg(DIM)
    } else {
        Style::default().fg(ACCENT)
    };

    let block = Block::bordered()
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(BORDER))
        .title(Span::styled(" message ", title_style));

    let inner_w = area.width.saturating_sub(2).max(1);
    let inner_h = area.height.saturating_sub(2);

    let display_text = if app.input.is_empty() && !is_busy {
        Text::from(Span::styled("…", Style::default().fg(FAINT)))
    } else {
        Text::from(app.input.as_str())
    };

    let content_h = estimate_wrapped_height(&display_text, inner_w);
    let input_scroll = content_h.saturating_sub(inner_h);

    let input = Paragraph::new(display_text)
        .block(block)
        .wrap(Wrap { trim: false })
        .scroll((input_scroll, 0));

    f.render_widget(input, area);

    // Cursor positioning.
    if !is_busy {
        let w = inner_w as usize;
        let visual_len = Line::from(app.input.as_str()).width();
        let cursor_row = (visual_len / w) as u16;
        let cursor_col = (visual_len % w) as u16;
        let visible_row = cursor_row.saturating_sub(input_scroll);

        let cx = area.x + 1 + cursor_col;
        let cy = area.y + 1 + visible_row;

        if cy < area.y + area.height.saturating_sub(1) {
            f.set_cursor_position(Position::new(cx, cy));
        }
    }
}

// ── Status bar ──────────────────────────────────────────────────────

fn render_status(f: &mut Frame, app: &App, area: Rect) {
    let (dot, dot_color, label) = match &app.status {
        Status::Connected => ("●", USER, "ready"),
        Status::Waiting => ("◌", DIM, "thinking"),
        Status::WaitingForApproval { .. } => ("⚠", SYSTEM, "approval required"),
    };

    let mut spans = vec![
        Span::raw("  "),
        Span::styled(dot, Style::default().fg(dot_color)),
        Span::styled(format!(" {label}"), Style::default().fg(DIM)),
    ];

    let total = app.total_usage.prompt_tokens + app.total_usage.completion_tokens;
    if total > 0 {
        spans.push(Span::styled("  │  ", Style::default().fg(SEPARATOR)));
        spans.push(Span::styled(
            format!(
                "{}+{} tokens",
                app.total_usage.prompt_tokens, app.total_usage.completion_tokens
            ),
            Style::default().fg(DIM),
        ));
    }

    spans.push(Span::styled("  │  ", Style::default().fg(SEPARATOR)));
    spans.push(Span::styled(
        "↑↓ scroll  Esc quit",
        Style::default().fg(FAINT),
    ));

    f.render_widget(Paragraph::new(Line::from(spans)), area);
}

// ── Helpers ─────────────────────────────────────────────────────────

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

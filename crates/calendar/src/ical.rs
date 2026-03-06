use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime};

use crate::db::EventRow;
use crate::error::{CalendarError, Result};

/// Parsed VEVENT data.
#[derive(Debug, Clone)]
pub struct ParsedEvent {
    pub uid: String,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: NaiveDateTime,
    pub end: NaiveDateTime,
    pub all_day: bool,
    pub recurrence_rule: Option<String>,
}

/// Parse a VCALENDAR string and extract VEVENTs.
pub fn parse_ical(ical_data: &str) -> Result<Vec<ParsedEvent>> {
    let mut events = Vec::new();
    let mut in_vevent = false;
    let mut props: Vec<(String, String)> = Vec::new();

    for line in unfold_lines(ical_data) {
        let trimmed = line.trim();
        if trimmed == "BEGIN:VEVENT" {
            in_vevent = true;
            props.clear();
        } else if trimmed == "END:VEVENT" {
            in_vevent = false;
            if let Some(event) = parse_vevent_props(&props)? {
                events.push(event);
            }
        } else if in_vevent {
            if let Some((key, value)) = trimmed.split_once(':') {
                props.push((key.to_string(), value.to_string()));
            }
        }
    }

    Ok(events)
}

/// Expand a parsed event into database rows, expanding RRULEs into instances.
pub fn expand_to_rows(
    parsed: &ParsedEvent,
    calendar_id: &str,
    etag: Option<&str>,
    raw_ical: Option<&str>,
    until: NaiveDateTime,
) -> Vec<EventRow> {
    let mut rows = Vec::new();
    let duration = parsed.end - parsed.start;

    match &parsed.recurrence_rule {
        Some(rrule) => {
            // Parent row (has recurrence_rule, no parent_event_id)
            let parent_id = parsed.uid.clone();
            rows.push(EventRow {
                id: parent_id.clone(),
                calendar_id: calendar_id.to_string(),
                uid: parsed.uid.clone(),
                etag: etag.map(|s| s.to_string()),
                summary: parsed.summary.clone(),
                description: parsed.description.clone(),
                location: parsed.location.clone(),
                start_at: format_dt(parsed.start),
                end_at: format_dt(parsed.end),
                all_day: parsed.all_day,
                recurrence_rule: Some(rrule.clone()),
                raw_ical: raw_ical.map(|s| s.to_string()),
                parent_event_id: None,
            });

            // Expand instances
            let instances = expand_rrule(parsed.start, rrule, until);
            for instance_start in instances {
                let instance_end = instance_start + duration;
                let date_tag = instance_start.format("%Y%m%d").to_string();
                rows.push(EventRow {
                    id: format!("{}_{}", parsed.uid, date_tag),
                    calendar_id: calendar_id.to_string(),
                    uid: parsed.uid.clone(),
                    etag: etag.map(|s| s.to_string()),
                    summary: parsed.summary.clone(),
                    description: parsed.description.clone(),
                    location: parsed.location.clone(),
                    start_at: format_dt(instance_start),
                    end_at: format_dt(instance_end),
                    all_day: parsed.all_day,
                    recurrence_rule: None,
                    raw_ical: None,
                    parent_event_id: Some(parent_id.clone()),
                });
            }
        }
        None => {
            rows.push(EventRow {
                id: parsed.uid.clone(),
                calendar_id: calendar_id.to_string(),
                uid: parsed.uid.clone(),
                etag: etag.map(|s| s.to_string()),
                summary: parsed.summary.clone(),
                description: parsed.description.clone(),
                location: parsed.location.clone(),
                start_at: format_dt(parsed.start),
                end_at: format_dt(parsed.end),
                all_day: parsed.all_day,
                recurrence_rule: None,
                raw_ical: raw_ical.map(|s| s.to_string()),
                parent_event_id: None,
            });
        }
    }

    rows
}

// ── iCal line unfolding ──────────────────────────────────────────────

fn unfold_lines(data: &str) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();

    for line in data.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            // Continuation line
            current.push_str(line[1..].trim_end());
        } else {
            if !current.is_empty() {
                lines.push(current.clone());
            }
            current = line.trim_end().to_string();
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

// ── VEVENT property parsing ──────────────────────────────────────────

fn parse_vevent_props(props: &[(String, String)]) -> Result<Option<ParsedEvent>> {
    let uid = find_prop(props, "UID").unwrap_or_default();
    let summary = find_prop(props, "SUMMARY").unwrap_or_default();
    if uid.is_empty() || summary.is_empty() {
        return Ok(None);
    }

    let description = find_prop(props, "DESCRIPTION");
    let location = find_prop(props, "LOCATION");
    let rrule = find_prop(props, "RRULE");

    let (start, start_all_day) = parse_dt_prop(props, "DTSTART")?;
    let end = if let Ok((end, ..)) = parse_dt_prop(props, "DTEND") {
        end
    } else if let Some(dur_str) = find_prop(props, "DURATION") {
        start + parse_duration_value(&dur_str)
    } else if start_all_day {
        start + Duration::days(1)
    } else {
        start
    };

    Ok(Some(ParsedEvent {
        uid,
        summary,
        description,
        location,
        start,
        end,
        all_day: start_all_day,
        recurrence_rule: rrule,
    }))
}

fn find_prop(props: &[(String, String)], name: &str) -> Option<String> {
    props.iter().find_map(|(k, v)| {
        let key_base = k.split(';').next().unwrap_or(k);
        if key_base == name {
            Some(v.clone())
        } else {
            None
        }
    })
}

fn parse_dt_prop(props: &[(String, String)], name: &str) -> Result<(NaiveDateTime, bool)> {
    let (key, value) = props
        .iter()
        .find(|(k, ..)| {
            let base = k.split(';').next().unwrap_or(k);
            base == name
        })
        .ok_or_else(|| CalendarError::Ical(format!("{name} not found")))?;

    let is_date_only = key.contains("VALUE=DATE") || value.len() == 8;

    if is_date_only {
        let date = NaiveDate::parse_from_str(value, "%Y%m%d")
            .map_err(|e| CalendarError::Ical(format!("parse {name} date: {e}")))?;
        Ok((date.and_hms_opt(0, 0, 0).unwrap_or_default(), true))
    } else {
        let clean = value.trim_end_matches('Z');
        let dt = NaiveDateTime::parse_from_str(clean, "%Y%m%dT%H%M%S")
            .map_err(|e| CalendarError::Ical(format!("parse {name} datetime: {e}")))?;
        Ok((dt, false))
    }
}

fn parse_duration_value(dur: &str) -> Duration {
    // Minimal ISO 8601 duration parser: PT1H, PT30M, P1D, etc.
    let s = dur.trim_start_matches('P');
    if let Some(rest) = s.strip_prefix('T') {
        if let Some(h) = rest.strip_suffix('H') {
            return Duration::hours(h.parse().unwrap_or(0));
        }
        if let Some(m) = rest.strip_suffix('M') {
            return Duration::minutes(m.parse().unwrap_or(0));
        }
        if let Some(secs) = rest.strip_suffix('S') {
            return Duration::seconds(secs.parse().unwrap_or(0));
        }
    }
    if let Some(d) = s.strip_suffix('D') {
        return Duration::days(d.parse().unwrap_or(0));
    }
    if let Some(w) = s.strip_suffix('W') {
        return Duration::weeks(w.parse().unwrap_or(0));
    }
    Duration::zero()
}

// ── RRULE expansion ──────────────────────────────────────────────────

fn expand_rrule(
    start: NaiveDateTime,
    rrule: &str,
    until_boundary: NaiveDateTime,
) -> Vec<NaiveDateTime> {
    let parts: std::collections::HashMap<&str, &str> =
        rrule.split(';').filter_map(|s| s.split_once('=')).collect();

    let freq = match parts.get("FREQ") {
        Some(f) => *f,
        None => return vec![start],
    };

    let interval: u32 = parts
        .get("INTERVAL")
        .and_then(|v| v.parse().ok())
        .unwrap_or(1);

    let count: Option<u32> = parts.get("COUNT").and_then(|v| v.parse().ok());

    let rrule_until: Option<NaiveDateTime> = parts.get("UNTIL").and_then(|v| {
        let clean = v.trim_end_matches('Z');
        if clean.len() == 8 {
            NaiveDate::parse_from_str(clean, "%Y%m%d")
                .ok()
                .and_then(|d| d.and_hms_opt(23, 59, 59))
        } else {
            NaiveDateTime::parse_from_str(clean, "%Y%m%dT%H%M%S").ok()
        }
    });

    let by_day: Vec<&str> = parts
        .get("BYDAY")
        .map(|v| v.split(',').collect())
        .unwrap_or_default();

    let by_monthday: Vec<u32> = parts
        .get("BYMONTHDAY")
        .map(|v| v.split(',').filter_map(|d| d.parse().ok()).collect())
        .unwrap_or_default();

    let effective_until = match rrule_until {
        Some(u) if u < until_boundary => u,
        _ => until_boundary,
    };

    let max_count = count.unwrap_or(366);
    let mut instances = Vec::new();
    let mut current = start;
    let mut generated = 0u32;

    // First instance is the original event start
    instances.push(current);
    generated += 1;

    loop {
        if generated >= max_count {
            break;
        }

        current = advance(current, freq, interval);

        if current > effective_until {
            break;
        }

        // BYDAY filter (for WEEKLY freq mainly)
        if !by_day.is_empty() {
            let weekday = weekday_abbrev(current);
            if !by_day.contains(&weekday) {
                continue;
            }
        }

        // BYMONTHDAY filter
        if !by_monthday.is_empty() && !by_monthday.contains(&current.day()) {
            continue;
        }

        instances.push(current);
        generated += 1;
    }

    instances
}

fn advance(dt: NaiveDateTime, freq: &str, interval: u32) -> NaiveDateTime {
    match freq {
        "DAILY" => dt + Duration::days(interval as i64),
        "WEEKLY" => dt + Duration::weeks(interval as i64),
        "MONTHLY" => add_months(dt, interval),
        "YEARLY" => add_months(dt, interval * 12),
        _ => dt + Duration::days(interval as i64),
    }
}

fn add_months(dt: NaiveDateTime, months: u32) -> NaiveDateTime {
    let total_months = dt.month0() + months;
    let new_year = dt.year() + (total_months / 12) as i32;
    let new_month = (total_months % 12) + 1;
    let max_day = days_in_month(new_year, new_month);
    let new_day = dt.day().min(max_day);
    NaiveDate::from_ymd_opt(new_year, new_month, new_day)
        .unwrap_or(dt.date())
        .and_time(dt.time())
}

fn days_in_month(year: i32, month: u32) -> u32 {
    NaiveDate::from_ymd_opt(
        if month == 12 { year + 1 } else { year },
        if month == 12 { 1 } else { month + 1 },
        1,
    )
    .unwrap_or(NaiveDate::from_ymd_opt(year, month, 28).unwrap_or_default())
    .pred_opt()
    .map(|d| d.day())
    .unwrap_or(28)
}

fn weekday_abbrev(dt: NaiveDateTime) -> &'static str {
    match dt.weekday() {
        chrono::Weekday::Mon => "MO",
        chrono::Weekday::Tue => "TU",
        chrono::Weekday::Wed => "WE",
        chrono::Weekday::Thu => "TH",
        chrono::Weekday::Fri => "FR",
        chrono::Weekday::Sat => "SA",
        chrono::Weekday::Sun => "SU",
    }
}

fn format_dt(dt: NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_event() {
        let ical = "BEGIN:VCALENDAR\r\n\
BEGIN:VEVENT\r\n\
UID:abc123\r\n\
SUMMARY:Team Meeting\r\n\
DTSTART:20250615T100000Z\r\n\
DTEND:20250615T110000Z\r\n\
LOCATION:Room A\r\n\
DESCRIPTION:Weekly sync\r\n\
END:VEVENT\r\n\
END:VCALENDAR";

        let events = parse_ical(ical).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].uid, "abc123");
        assert_eq!(events[0].summary, "Team Meeting");
        assert_eq!(events[0].location.as_deref(), Some("Room A"));
        assert!(!events[0].all_day);
    }

    #[test]
    fn parse_all_day_event() {
        let ical = "BEGIN:VCALENDAR\r\n\
BEGIN:VEVENT\r\n\
UID:allday1\r\n\
SUMMARY:Holiday\r\n\
DTSTART;VALUE=DATE:20250701\r\n\
DTEND;VALUE=DATE:20250702\r\n\
END:VEVENT\r\n\
END:VCALENDAR";

        let events = parse_ical(ical).unwrap();
        assert_eq!(events.len(), 1);
        assert!(events[0].all_day);
        assert_eq!(
            events[0].start.date(),
            NaiveDate::from_ymd_opt(2025, 7, 1).unwrap()
        );
    }

    #[test]
    fn expand_standalone_event() {
        let event = ParsedEvent {
            uid: "e1".into(),
            summary: "Meeting".into(),
            description: None,
            location: None,
            start: NaiveDate::from_ymd_opt(2025, 6, 15)
                .unwrap()
                .and_hms_opt(10, 0, 0)
                .unwrap(),
            end: NaiveDate::from_ymd_opt(2025, 6, 15)
                .unwrap()
                .and_hms_opt(11, 0, 0)
                .unwrap(),
            all_day: false,
            recurrence_rule: None,
        };

        let rows = expand_to_rows(
            &event,
            "c1",
            Some("etag1"),
            None,
            NaiveDate::from_ymd_opt(2025, 12, 31)
                .unwrap()
                .and_hms_opt(23, 59, 59)
                .unwrap(),
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "e1");
        assert!(rows[0].parent_event_id.is_none());
    }

    #[test]
    fn expand_daily_rrule() {
        let event = ParsedEvent {
            uid: "daily1".into(),
            summary: "Standup".into(),
            description: None,
            location: None,
            start: NaiveDate::from_ymd_opt(2025, 6, 1)
                .unwrap()
                .and_hms_opt(9, 0, 0)
                .unwrap(),
            end: NaiveDate::from_ymd_opt(2025, 6, 1)
                .unwrap()
                .and_hms_opt(9, 15, 0)
                .unwrap(),
            all_day: false,
            recurrence_rule: Some("FREQ=DAILY;COUNT=3".into()),
        };

        let rows = expand_to_rows(
            &event,
            "c1",
            None,
            None,
            NaiveDate::from_ymd_opt(2025, 12, 31)
                .unwrap()
                .and_hms_opt(23, 59, 59)
                .unwrap(),
        );
        // 1 parent + 3 instances
        assert_eq!(rows.len(), 4);
        assert!(rows[0].recurrence_rule.is_some()); // parent
        assert_eq!(rows[1].id, "daily1_20250601");
        assert_eq!(rows[2].id, "daily1_20250602");
        assert_eq!(rows[3].id, "daily1_20250603");
    }

    #[test]
    fn expand_weekly_rrule_with_until() {
        let event = ParsedEvent {
            uid: "weekly1".into(),
            summary: "Review".into(),
            description: None,
            location: None,
            start: NaiveDate::from_ymd_opt(2025, 6, 2) // Monday
                .unwrap()
                .and_hms_opt(14, 0, 0)
                .unwrap(),
            end: NaiveDate::from_ymd_opt(2025, 6, 2)
                .unwrap()
                .and_hms_opt(15, 0, 0)
                .unwrap(),
            all_day: false,
            recurrence_rule: Some("FREQ=WEEKLY;UNTIL=20250623T235959Z".into()),
        };

        let until = NaiveDate::from_ymd_opt(2025, 12, 31)
            .unwrap()
            .and_hms_opt(23, 59, 59)
            .unwrap();

        let rows = expand_to_rows(&event, "c1", None, None, until);
        // parent + 4 instances (Jun 2, 9, 16, 23)
        assert_eq!(rows.len(), 5);
    }

    #[test]
    fn expand_monthly_rrule() {
        let event = ParsedEvent {
            uid: "monthly1".into(),
            summary: "Report".into(),
            description: None,
            location: None,
            start: NaiveDate::from_ymd_opt(2025, 1, 15)
                .unwrap()
                .and_hms_opt(10, 0, 0)
                .unwrap(),
            end: NaiveDate::from_ymd_opt(2025, 1, 15)
                .unwrap()
                .and_hms_opt(11, 0, 0)
                .unwrap(),
            all_day: false,
            recurrence_rule: Some("FREQ=MONTHLY;COUNT=3".into()),
        };

        let until = NaiveDate::from_ymd_opt(2025, 12, 31)
            .unwrap()
            .and_hms_opt(23, 59, 59)
            .unwrap();

        let rows = expand_to_rows(&event, "c1", None, None, until);
        // parent + 3 instances (Jan 15, Feb 15, Mar 15)
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[2].id, "monthly1_20250215");
        assert_eq!(rows[3].id, "monthly1_20250315");
    }

    #[test]
    fn line_unfolding() {
        let data = "SUMMARY:This is a long\r\n summary line\r\nUID:abc";
        let lines = unfold_lines(data);
        assert_eq!(lines[0], "SUMMARY:This is a longsummary line");
        assert_eq!(lines[1], "UID:abc");
    }
}

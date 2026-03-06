use crate::error::{CalendarError, Result};

/// A discovered CalDAV calendar.
#[derive(Debug, Clone)]
pub struct DiscoveredCalendar {
    pub path: String,
    pub display_name: String,
    pub color: Option<String>,
    pub ctag: Option<String>,
}

/// A fetched event from CalDAV.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct FetchedEvent {
    pub href: String,
    pub etag: Option<String>,
    pub ical_data: String,
}

/// CalDAV client for discovering calendars and fetching events.
pub struct CaldavClient {
    http: reqwest::Client,
    base_url: String,
    email: String,
    password: String,
}

impl CaldavClient {
    pub fn new(base_url: String, email: String, password: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url,
            email,
            password,
        }
    }

    /// Discover calendars via PROPFIND chain: principal → calendar-home → calendars.
    pub async fn discover_calendars(&self) -> Result<Vec<DiscoveredCalendar>> {
        let principal = self.find_principal().await?;
        let home = self.find_calendar_home(&principal).await?;
        self.list_calendars(&home).await
    }

    /// Fetch events in a time range from a specific calendar.
    pub async fn fetch_events(
        &self,
        calendar_path: &str,
        from: &str,
        to: &str,
    ) -> Result<Vec<FetchedEvent>> {
        let url = self.resolve_url(calendar_path);
        let body = format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="{from}" end="{to}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>"#
        );

        let resp = self.send_report(&url, &body).await?;
        parse_report_events(&resp)
    }

    async fn find_principal(&self) -> Result<String> {
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal/>
  </D:prop>
</D:propfind>"#;

        let resp = self.send_propfind(&self.base_url, body, "0").await?;
        parse_principal_href(&resp)
    }

    async fn find_calendar_home(&self, principal_path: &str) -> Result<String> {
        let url = self.resolve_url(principal_path);
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
  </D:prop>
</D:propfind>"#;

        let resp = self.send_propfind(&url, body, "0").await?;
        parse_calendar_home_href(&resp)
    }

    async fn list_calendars(&self, home_path: &str) -> Result<Vec<DiscoveredCalendar>> {
        let url = self.resolve_url(home_path);
        let body = r#"<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"
            xmlns:CS="http://calendarserver.org/ns/"
            xmlns:ICAL="http://apple.com/ns/ical/">
  <D:prop>
    <D:resourcetype/>
    <D:displayname/>
    <ICAL:calendar-color/>
    <CS:getctag/>
  </D:prop>
</D:propfind>"#;

        let resp = self.send_propfind(&url, body, "1").await?;
        parse_calendar_list(&resp)
    }

    fn resolve_url(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") {
            return path.to_string();
        }
        // Strip trailing slash from base, path keeps leading slash
        let base = self.base_url.trim_end_matches('/');
        format!("{base}{path}")
    }

    async fn send_propfind(&self, url: &str, body: &str, depth: &str) -> Result<String> {
        let resp = self
            .http
            .request(
                reqwest::Method::from_bytes(b"PROPFIND").unwrap_or(reqwest::Method::GET),
                url,
            )
            .basic_auth(&self.email, Some(&self.password))
            .header("Content-Type", "application/xml; charset=utf-8")
            .header("Depth", depth)
            .body(body.to_string())
            .send()
            .await?;

        if !resp.status().is_success() && resp.status().as_u16() != 207 {
            return Err(CalendarError::Caldav(format!(
                "PROPFIND {} returned {}",
                url,
                resp.status()
            )));
        }
        resp.text().await.map_err(Into::into)
    }

    async fn send_report(&self, url: &str, body: &str) -> Result<String> {
        let resp = self
            .http
            .request(
                reqwest::Method::from_bytes(b"REPORT").unwrap_or(reqwest::Method::GET),
                url,
            )
            .basic_auth(&self.email, Some(&self.password))
            .header("Content-Type", "application/xml; charset=utf-8")
            .header("Depth", "1")
            .body(body.to_string())
            .send()
            .await?;

        if !resp.status().is_success() && resp.status().as_u16() != 207 {
            return Err(CalendarError::Caldav(format!(
                "REPORT {} returned {}",
                url,
                resp.status()
            )));
        }
        resp.text().await.map_err(Into::into)
    }
}

// ── XML parsing helpers ──────────────────────────────────────────────

fn find_text_in_element<'a>(node: &roxmltree::Node<'a, 'a>, local_name: &str) -> Option<String> {
    node.descendants()
        .find(|n| n.tag_name().name() == local_name)
        .and_then(|n| n.text().map(|t| t.trim().to_string()))
}

pub(crate) fn parse_principal_href(xml: &str) -> Result<String> {
    let doc = roxmltree::Document::parse(xml)
        .map_err(|e| CalendarError::Xml(format!("parse principal: {e}")))?;

    for node in doc.descendants() {
        if node.tag_name().name() == "current-user-principal" {
            if let Some(href) = node
                .descendants()
                .find(|n| n.tag_name().name() == "href")
                .and_then(|n| n.text())
            {
                return Ok(href.trim().to_string());
            }
        }
    }

    Err(CalendarError::Xml(
        "current-user-principal href not found".into(),
    ))
}

pub(crate) fn parse_calendar_home_href(xml: &str) -> Result<String> {
    let doc = roxmltree::Document::parse(xml)
        .map_err(|e| CalendarError::Xml(format!("parse calendar-home: {e}")))?;

    for node in doc.descendants() {
        if node.tag_name().name() == "calendar-home-set" {
            if let Some(href) = node
                .descendants()
                .find(|n| n.tag_name().name() == "href")
                .and_then(|n| n.text())
            {
                return Ok(href.trim().to_string());
            }
        }
    }

    Err(CalendarError::Xml(
        "calendar-home-set href not found".into(),
    ))
}

pub(crate) fn parse_calendar_list(xml: &str) -> Result<Vec<DiscoveredCalendar>> {
    let doc = roxmltree::Document::parse(xml)
        .map_err(|e| CalendarError::Xml(format!("parse calendar list: {e}")))?;

    let mut calendars = Vec::new();

    for response in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "response")
    {
        // Check if this response has a calendar resourcetype
        let is_calendar = response
            .descendants()
            .any(|n| n.tag_name().name() == "calendar");
        if !is_calendar {
            continue;
        }

        let path = response
            .children()
            .find(|n| n.tag_name().name() == "href")
            .and_then(|n| n.text())
            .map(|t| t.trim().to_string())
            .unwrap_or_default();

        if path.is_empty() {
            continue;
        }

        let display_name =
            find_text_in_element(&response, "displayname").unwrap_or_else(|| path.clone());
        let color = find_text_in_element(&response, "calendar-color");
        let ctag = find_text_in_element(&response, "getctag");

        calendars.push(DiscoveredCalendar {
            path,
            display_name,
            color,
            ctag,
        });
    }

    Ok(calendars)
}

pub(crate) fn parse_report_events(xml: &str) -> Result<Vec<FetchedEvent>> {
    let doc = roxmltree::Document::parse(xml)
        .map_err(|e| CalendarError::Xml(format!("parse report: {e}")))?;

    let mut events = Vec::new();

    for response in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "response")
    {
        let href = response
            .children()
            .find(|n| n.tag_name().name() == "href")
            .and_then(|n| n.text())
            .map(|t| t.trim().to_string())
            .unwrap_or_default();

        let etag =
            find_text_in_element(&response, "getetag").map(|s| s.trim_matches('"').to_string());

        let ical_data = response
            .descendants()
            .find(|n| n.tag_name().name() == "calendar-data")
            .and_then(|n| n.text())
            .map(|t| t.to_string());

        if let Some(ical_data) = ical_data {
            events.push(FetchedEvent {
                href,
                etag,
                ical_data,
            });
        }
    }

    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_principal_response() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/</D:href>
    <D:propstat>
      <D:prop>
        <D:current-user-principal>
          <D:href>/principals/users/alice/</D:href>
        </D:current-user-principal>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let href = parse_principal_href(xml).unwrap();
        assert_eq!(href, "/principals/users/alice/");
    }

    #[test]
    fn parse_calendar_home_response() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/principals/users/alice/</D:href>
    <D:propstat>
      <D:prop>
        <C:calendar-home-set>
          <D:href>/dav/calendars/user/alice/</D:href>
        </C:calendar-home-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let href = parse_calendar_home_href(xml).unwrap();
        assert_eq!(href, "/dav/calendars/user/alice/");
    }

    #[test]
    fn parse_calendar_list_response() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"
               xmlns:CS="http://calendarserver.org/ns/"
               xmlns:ICAL="http://apple.com/ns/ical/">
  <D:response>
    <D:href>/dav/calendars/user/alice/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/calendars/user/alice/personal/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <D:displayname>Personal</D:displayname>
        <ICAL:calendar-color>#FF0000</ICAL:calendar-color>
        <CS:getctag>ctag123</CS:getctag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/calendars/user/alice/work/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <D:displayname>Work</D:displayname>
        <CS:getctag>ctag456</CS:getctag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let cals = parse_calendar_list(xml).unwrap();
        assert_eq!(cals.len(), 2);
        assert_eq!(cals[0].display_name, "Personal");
        assert_eq!(cals[0].color.as_deref(), Some("#FF0000"));
        assert_eq!(cals[0].ctag.as_deref(), Some("ctag123"));
        assert_eq!(cals[1].display_name, "Work");
        assert!(cals[1].color.is_none());
    }

    #[test]
    fn parse_report_response() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/dav/calendars/user/alice/personal/event1.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"etag-abc"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Meeting
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        let events = parse_report_events(xml).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].etag.as_deref(), Some("etag-abc"));
        assert!(events[0].ical_data.contains("SUMMARY:Meeting"));
    }
}

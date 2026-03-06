# Security Assessment: Aperture Server

**Date:** 2026-03-06
**Scope:** `crates/server/`, with supporting review of `crates/runtime/` (auth, secrets, db), `crates/engine/` (events, errors), and `crates/protocol/` (wire types).

---

## Summary

| Severity      | Count |
|---------------|-------|
| Critical      | 1     |
| High          | 0     |
| Medium        | 3     |
| Low           | 2     |
| Informational | 4     |

---

## Critical Findings

### CRIT-1: JWTs Have No Expiration — Tokens Are Valid Forever

**File:** `crates/runtime/src/auth/jwt.rs`

```rust
validation.required_spec_claims.clear();  // Removes "exp" from required set
validation.validate_exp = false;           // Disables expiration enforcement
```

The `JwtClaims` struct only stores `sub` and `iat` — no `exp`. A token issued at login is valid indefinitely. There is no mechanism to invalidate a session short of rotating the JWT secret (which invalidates all users). A stolen token grants permanent access.

**Fix:** Add an `exp` claim (e.g. `iat + 24h`), remove `validate_exp = false`, keep `exp` in `required_spec_claims`. Add a token refresh endpoint for long-lived sessions.

---

### ~~CRIT-2: No CORS Middleware~~ — RESOLVED

The `tower-http` CORS dependency has been removed. The only client is the CLI, which is not subject to browser CORS restrictions. No browser-based client is supported, so CORS middleware is unnecessary.

---

## High Findings

### ~~HIGH-1: Unauthenticated `/schema` Endpoint~~ — ACCEPTED RISK

The `/schema` endpoint is intentionally public. It serves as API documentation for client generation (similar to OpenAPI), and does not expose sensitive data.

---

### ~~HIGH-2: Unbounded Concurrent Action Invocations~~ — RESOLVED

A per-connection `Semaphore` (8 permits) now caps concurrent in-flight actions. Each spawned task acquires a permit before invoking the action and releases it on completion.

---

### ~~HIGH-3: No WebSocket Message Size Limit~~ — RESOLVED

WebSocket upgrade now sets `max_message_size(1 MB)`, down from the 64 MB default. Messages exceeding this are rejected at the protocol layer before deserialization.

---

### ~~HIGH-4: Cross-User Event Leakage via Global Broadcast~~ — RESOLVED

`EventEnvelope` now carries `user_id: Option<String>`. All publish call sites pass the originating user ID. The WebSocket event forwarding loop in `ws.rs` filters envelopes, only forwarding events whose `user_id` matches the authenticated connection (or events with no user scope).

---

### ~~HIGH-5: Upstream API Error Bodies Leaked to Clients~~ — RESOLVED

Full upstream error bodies are now logged server-side via `eprintln!`. Clients receive only a generic message with the HTTP status code (e.g. `"LLM request failed (429)"`) — no response body is forwarded.

---

### ~~HIGH-6: No TLS~~ — ACCEPTED RISK

The application is designed to run behind a reverse proxy (e.g. nginx, Caddy) that handles TLS termination. The server itself does not need to implement TLS.

---

## Medium Findings

### ~~MED-1: Hello-Phase Has No Timeout~~ — RESOLVED

`wait_for_hello` is now wrapped in `tokio::time::timeout(Duration::from_secs(30))`. Connections that don't authenticate within 30 seconds are dropped.

---

### ~~MED-2: Secret Files Written with Default umask~~ — RESOLVED

Both `jwt_secret` and `secret.key` are now written via `OpenOptions` with explicit `mode(0o600)` (owner read/write only), regardless of the process umask.

---

### MED-3: Action Name Echoed in Error Responses — Information Oracle

**File:** `crates/server/src/ws.rs`

`EngineError::ActionNotFound` includes the client-supplied action name verbatim in the error. Combined with the unauthenticated `/schema` endpoint, this enables probing.

**Fix:** Return a generic `"action not found"` without echoing the input.

---

### MED-4: Deleted Users Retain Active Sessions

**File:** `crates/server/src/ws.rs`, `crates/runtime/src/auth/jwt.rs`

After the initial handshake, `user_id` is validated only cryptographically (JWT signature). If an admin deletes a user, their existing WebSocket sessions continue working indefinitely.

**Fix:** Periodically re-validate `user_id` against the database. Broadcast a user-deletion event to terminate active sessions.

---

### MED-5: No HTTP Client Timeout — LLM Calls Can Hang Forever

**File:** `crates/server/src/setup.rs`

`reqwest::Client::new()` has no `timeout` or `connect_timeout`. A hanging upstream service pins the Tokio task forever.

**Fix:** `reqwest::Client::builder().timeout(Duration::from_secs(120)).connect_timeout(Duration::from_secs(10)).build()`.

---

## Low Findings

### LOW-1: SSRF via `OPENAI_BASE_URL`

**File:** `crates/server/src/config.rs`, `crates/server/src/setup.rs`

`OPENAI_BASE_URL` accepts arbitrary URLs without validation. If influenced by an attacker, LLM calls (including the Bearer token) could be redirected to internal services.

**Fix:** Validate the URL scheme (`https://`) at startup. Block private IP ranges in shared environments.

---

### LOW-2: Internal Error Strings Returned to Clients

**File:** `crates/server/src/auth.rs`, `crates/server/src/ws.rs`

Database, file I/O, and internal errors are converted to strings and returned in HTTP/WebSocket responses. These may contain filesystem paths, schema details, or other implementation information.

**Fix:** Log full errors server-side with a correlation ID. Return generic messages to clients.

---

### ~~LOW-3: No Logging or Audit Trail~~ — RESOLVED

Structured JSON logging added via `tracing` / `tracing-subscriber` with `env-filter`. Key events logged: login success/failure, token validation failure, WebSocket connect/disconnect, hello timeout, action invocation, action errors, and LLM/embedding API errors. Controlled via `RUST_LOG` (defaults to `aperture=info`).

---

### ~~LOW-4: Outdated Dependencies~~ — RESOLVED

All dependencies upgraded to latest major versions (landlock excluded per design). Notable: `rpassword` 5→7, `rusqlite` 0.32→0.38, `reqwest` 0.12→0.13, `jsonwebtoken` 9→10, `rand` 0.8/0.9→0.10, `scraper` 0.22→0.25, `rquickjs` 0.9→0.11.

---

## Informational Findings

### INFO-1: `expect()` in Request-Handling Paths

**File:** `crates/server/src/setup.rs`

Multiple `expect()` calls in `PromptRunner` impl methods. A programming error would panic and crash the server during live request handling, violating the project's no-`expect` rule.

**Recommendation:** Convert to `ok_or_else` with proper `EngineError` variants.

---

### INFO-2: Single-Connection Database — Write Contention Under Load

**File:** `crates/runtime/src/db.rs`

All operations serialize through a single SQLite connection behind a `Mutex`. Under multi-user load this becomes a bottleneck, amplifying the DoS impact of HIGH-2.

---

### INFO-3: JWT Token in WebSocket Message Body

**File:** `crates/protocol/src/lib.rs`

The JWT is sent inside the WebSocket JSON payload rather than as an HTTP header during the upgrade. Tokens in message bodies are more likely to appear in application-level logs if logging is added.

---

### INFO-4: `user_id` Used as Filesystem Path Component Without Format Validation

**File:** `crates/runtime/src/config.rs`

`user_id` (from JWT `sub`) is joined into filesystem paths. Currently safe because user IDs are UUIDv4, but no validation ensures this at path construction time. A crafted `sub` like `../../../etc` would cause path traversal.

**Recommendation:** Validate `user_id` matches UUID format before use in paths.

---

### ~~INFO-5: Dead CORS Dependency~~ — RESOLVED

Removed `tower-http` dependency entirely. The CLI client doesn't need CORS.

---

## Data Flow

```
Client
  |
  +-- POST /auth/login { username, password }  [PLAINTEXT]
  |     -> password verified (Argon2)
  |     -> JWT returned (no expiry)
  |
  +-- GET /schema  [NO AUTH]
  |     -> full action/event schemas returned
  |
  +-- WS /ws  [NO ORIGIN CHECK]
        |
        +-- Hello { token }
        |     -> JWT signature check only (no expiry, no DB re-check)
        |     -> event listener starts (ALL events, ALL users)
        |
        +-- InvokeAction { action, input }
              -> tokio::spawn (unbounded)
              -> engine.invoke_action(action, user_id, input)
                   -> may trigger LLM call (no timeout, errors leaked)
                   -> may invoke tools (filesystem, CLI, secrets)
                        -> user_id in path (no format validation)
                        -> secret key files (default umask)
              -> result/error returned to client (verbatim errors)
```

---

## Remediation Priority

### Immediate (before any network exposure)
- CRIT-1: JWT expiration
- ~~CRIT-2: CORS~~ — resolved (removed; CLI-only client)
- ~~HIGH-4: Per-user event filtering~~ — resolved
- ~~HIGH-6: TLS~~ — accepted risk (reverse proxy handles TLS termination)

### Short-term (before production use)
- ~~HIGH-1: Authenticate `/schema`~~ — accepted risk (intentional for client generation)
- ~~HIGH-2: Bounded concurrency~~ — resolved (semaphore, 8 permits per connection)
- ~~HIGH-3: WebSocket message size limit~~ — resolved (1 MB cap)
- ~~HIGH-5: Sanitize upstream error messages~~ — resolved
- ~~MED-1: Hello timeout~~ — resolved (30s)
- ~~MED-2: Secret file permissions~~ — resolved (`0o600`)

### Medium-term (hardening)
- MED-3: Don't echo action names in errors
- MED-4: Re-validate user on actions / handle deletion
- MED-5: HTTP client timeouts
- LOW-1: Validate `OPENAI_BASE_URL`
- LOW-2: Sanitize all client-facing errors
- ~~LOW-3: Structured logging~~ — resolved
- ~~LOW-4: Update dependencies~~ — resolved (all upgraded to latest)

### Ongoing (code quality)
- INFO-1: Replace `expect()` with proper error handling
- INFO-4: Validate `user_id` format at path boundaries

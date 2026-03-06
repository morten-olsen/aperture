# Security Assessment: Aperture Server

**Date:** 2026-03-06
**Scope:** `crates/server/`, with supporting review of `crates/runtime/` (auth, secrets, db), `crates/engine/` (events, errors), and `crates/protocol/` (wire types).

---

## Summary

| Severity      | Count |
|---------------|-------|
| Critical      | 1     |
| High          | 6     |
| Medium        | 5     |
| Low           | 4     |
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

### HIGH-1: Unauthenticated `/schema` Endpoint Leaks Full API Surface

**File:** `crates/server/src/routes.rs`

```rust
.route("/schema", get(schema_handler))  // No auth middleware
```

Any unauthenticated client can enumerate all action names, descriptions, input/output schemas, and event IDs. This provides full reconnaissance of system capabilities.

**Fix:** Require authentication on this route.

---

### HIGH-2: Unbounded Concurrent Action Invocations — No Rate Limiting

**File:** `crates/server/src/ws.rs`

Each `InvokeAction` message spawns a new Tokio task unconditionally. No limit on concurrent tasks per connection or globally. A single client can:
- Spawn thousands of tasks consuming memory
- Trigger unbounded LLM calls (draining API budget)
- Overflow the `mpsc::unbounded_channel` for outbound messages

**Fix:** Use a semaphore to cap concurrent in-flight actions per connection (e.g. 4–8). Use `mpsc::channel(N)` instead of `mpsc::unbounded_channel`. Consider a per-user rate limiter.

---

### HIGH-3: No WebSocket Message Size Limit — Memory Exhaustion

**File:** `crates/server/src/ws.rs`

The default `tokio-tungstenite` max message size is 64 MB. No downward configuration is applied. The `input: Value` field in `InvokeAction` is arbitrary JSON with no size constraint before being passed to `invoke_action`.

**Fix:** Configure the WebSocket upgrade with a reduced `max_message_size` (e.g. 1 MB). Validate input size before deserialization.

---

### HIGH-4: Cross-User Event Leakage via Global Broadcast

**File:** `crates/server/src/ws.rs`

```rust
let mut event_rx = state.engine.events().listen_all();
```

The wildcard event subscription receives every event from all users. In a multi-user deployment, user A's WebSocket receives user B's prompt events — including full prompt content, tool results, and text responses. This is a direct multi-tenancy data isolation breach.

**Fix:** Add `user_id` to `EventEnvelope`. Filter events in the WebSocket forwarding loop. Alternatively, use per-user event channels.

---

### HIGH-5: Upstream API Error Bodies Leaked to Clients

**File:** `crates/server/src/setup.rs`, `crates/server/src/ws.rs`

OpenAI API error responses are returned verbatim to clients via `e.to_string()`. These can reveal account status, rate limits, model access, organization details, and billing information.

**Fix:** Log full errors server-side. Return a sanitized generic message to the client (e.g. `"upstream service error"`) with a correlation ID.

---

### HIGH-6: No TLS — All Traffic Transmitted in Plaintext

**File:** `crates/server/src/main.rs`, `crates/server/src/config.rs`

The server binds a plain TCP listener. Login credentials, JWTs, and all data are transmitted without encryption. The default bind address is `0.0.0.0` (all interfaces).

**Fix:** Integrate `axum-server` with `RustlsConfig`. Add `TLS_CERT_PATH` / `TLS_KEY_PATH` config fields. Default bind to `127.0.0.1` unless explicitly configured.

---

## Medium Findings

### MED-1: Hello-Phase Has No Timeout — Connection Pinning

**File:** `crates/server/src/ws.rs`

`wait_for_hello` loops indefinitely. A client can open a WebSocket and send nothing, holding the connection forever. No connection limit exists.

**Fix:** Wrap in `tokio::time::timeout(Duration::from_secs(30), ...)`. Add a global connection counter; reject beyond a configurable limit.

---

### MED-2: Secret Files Written with Default umask — Potentially World-Readable

**File:** `crates/runtime/src/auth/jwt.rs`, `crates/runtime/src/secrets/crypto.rs`

JWT signing secret and AES-256-GCM encryption key are written with `std::fs::write`, inheriting the process umask. On systems with umask `0022`, files are world-readable.

**Fix:** Use `std::fs::OpenOptions` with `mode(0o600)` via `std::os::unix::fs::OpenOptionsExt`.

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

### LOW-3: No Logging or Audit Trail

There is no structured logging anywhere in the server. Login attempts, WebSocket connections, action invocations, and errors produce no log output. No way to audit activity or detect brute-force attempts.

**Fix:** Integrate `tracing` / `tracing-subscriber`. Emit structured events for auth, connections, actions, and errors.

---

### LOW-4: Outdated `rpassword` Dependency

**File:** `crates/server/Cargo.toml`

`rpassword = "5"` — several major versions behind current (7.x). No specific CVEs, but staying current reduces future vulnerability exposure.

**Fix:** Update to `rpassword = "7"`.

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
- HIGH-4: Per-user event filtering
- HIGH-6: TLS support; default to `127.0.0.1`

### Short-term (before production use)
- HIGH-1: Authenticate `/schema`
- HIGH-2: Bounded concurrency + rate limiting
- HIGH-3: WebSocket message size limit
- HIGH-5: Sanitize upstream error messages
- MED-1: Hello timeout
- MED-2: Secret file permissions (`0o600`)

### Medium-term (hardening)
- MED-3: Don't echo action names in errors
- MED-4: Re-validate user on actions / handle deletion
- MED-5: HTTP client timeouts
- LOW-1: Validate `OPENAI_BASE_URL`
- LOW-2: Sanitize all client-facing errors
- LOW-3: Structured logging
- LOW-4: Update `rpassword`

### Ongoing (code quality)
- INFO-1: Replace `expect()` with proper error handling
- INFO-4: Validate `user_id` format at path boundaries

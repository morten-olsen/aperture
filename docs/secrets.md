# Secrets

The secrets plugin provides encrypted key-value storage scoped per user. Agents can retrieve secret values at runtime (e.g. API keys, passwords) without the LLM ever seeing plaintext — retrieved values are automatically scrubbed from all sandbox output before reaching the model context.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  SecretPlugin (setup)                    │
│                                                         │
│  1. Loads/generates AES-256-GCM key (SecretKey)         │
│  2. Creates SecretStore (extension)                     │
│  3. Installs RedactionRegistry (extension)              │
└───────────────┬─────────────────────────────────────────┘
                │
    ┌───────────┴───────────┐
    │                       │
    ▼                       ▼
secrets_list         secrets_get_value
(no approval)        (requires approval)
    │                       │
    │                       ├─ Decrypts value via SecretStore
    │                       └─ Tracks value in RedactionRegistry
    │                              │
    │                              ▼
    │                    Sandbox runs script
    │                              │
    │                              ▼
    │                    RedactionRegistry scrubs
    │                    secret from result + console
    └──────────────────────────────┘
```

## Storage Layout

```
{data_root}/
├── secret.key                    # 32-byte AES-256-GCM key (auto-generated)
└── {user_id}/
    └── secrets.json              # Encrypted secrets for this user
```

Each user's `secrets.json` contains an array of entries with `id`, `name`, and `encrypted_value` fields. Values are encrypted with AES-256-GCM — each entry stores `base64(nonce ‖ ciphertext+tag)`.

## Encryption Key

The `SecretKey` is resolved in order of precedence:

1. **Environment variable** — `APERTURE_SECRET_KEY` (base64-encoded, must decode to exactly 32 bytes)
2. **Key file** — `{data_root}/secret.key` (raw 32 bytes on disk)
3. **Auto-generate** — If neither exists, 32 random bytes are generated and written to `secret.key`

## Redaction

The `RedactionRegistry` (defined in `aperture-engine`) prevents secret leakage:

1. When `secrets_get_value` decrypts a value, it calls `registry.track(value)` to register it for redaction
2. The registry is cleared at the start of each sandbox execution
3. After sandbox execution completes, `registry.redact_result()` replaces all tracked values with `[REDACTED]` in both the return value and console output
4. Values shorter than 8 characters are ignored to avoid false-positive redaction of common short strings

This means the agent's script can use the secret (e.g. pass it as an HTTP header), but the LLM never sees the plaintext in its context window.

## Tools

Two tools are registered by `SecretPlugin` during `prepare()`:

| Tool | Input | Approval | Description |
|------|-------|----------|-------------|
| `secrets_list` | *(none)* | No | List available secrets (id and name only, no values) |
| `secrets_get_value` | `secret_id` | **Always** | Decrypt and return a secret value; auto-tracked for redaction |

`secrets_get_value` requires human approval on every invocation to ensure the user consents to the agent accessing that specific secret.

## CLI Management

Secrets are managed through the server binary's `secret` subcommand:

```sh
# Add or update a secret (prompts for value on stdin)
cargo run -p aperture-server -- secret add <user_id> <secret_id> --name "Human-readable name"

# Remove a secret
cargo run -p aperture-server -- secret remove <user_id> <secret_id>
```

The `add` command reads the secret value via `rpassword` (no terminal echo). If a secret with the same ID already exists, it is overwritten (upsert).

## Example Flow

1. **Admin registers a secret** via CLI:
   ```
   $ cargo run -p aperture-server -- secret add alice google_cal_password --name "Google Calendar"
   Secret value: ********
   secret 'google_cal_password' added for user 'alice'
   ```

2. **Agent lists secrets** — calls `secrets_list`, gets back `[{id: "google_cal_password", name: "Google Calendar"}]`

3. **Agent retrieves the value** — calls `secrets_get_value` with `secret_id: "google_cal_password"` (requires user approval)

4. **Agent uses the value in a script** — e.g. passes it as an auth header in an HTTP request

5. **Redaction kicks in** — the actual password is replaced with `[REDACTED]` in all sandbox output before the LLM sees it

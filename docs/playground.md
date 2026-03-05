# Playground CLI

The playground crate (`crates/playground`) is a single-shot command-line tool that runs one prompt through the Aperture agent and prints the result. It connects the engine to an OpenAI-compatible API and registers all built-in plugins. Use it to test agent behavior and assess performance.

## Usage

```bash
# Pass prompt as argument
aperture-playground "What time is it?"

# Pipe prompt from stdin
echo "List the workspace contents" | aperture-playground

# JSON output for scripting
aperture-playground --json "What time is it?"

# Custom user ID
aperture-playground --user alice "Create a file called notes.md"
```

### Options

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON for programmatic consumption |
| `--user <ID>` | User ID (default: `playground-user`) |
| `--help` | Print help message |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success — prompt completed |
| 1 | Error — engine or LLM failure |
| 2 | Usage error — missing prompt, bad args, missing API key |
| 3 | Approval required — prompt paused waiting for human approval |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | API key for the LLM provider |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | Base URL for the chat completions endpoint |
| `OPENAI_MODEL` | No | `gpt-4o` | Model identifier passed in each request |

Any provider that implements the OpenAI `/chat/completions` contract works (e.g. Ollama, Together, Groq). Just set `OPENAI_BASE_URL` accordingly.

## Running

```bash
# OpenAI
OPENAI_API_KEY=sk-... cargo run -p aperture-playground -- "What time is it?"

# Ollama (local)
OPENAI_API_KEY=unused OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_MODEL=llama3 \
  cargo run -p aperture-playground -- "What time is it?"
```

## Plugins

The playground registers plugins in this order:

1. **RuntimeConfigPlugin** — Inserts `RuntimeConfig` into extensions
2. **FilesystemPlugin** — 7 sandboxed file tools (see [Filesystem](./filesystem.md))
3. **CliPlugin** — Sandboxed CLI execution with allow/deny rules (see [CLI](./cli.md))
4. **EchoPlugin** — `echo` tool that returns input text unchanged
5. **DateTimePlugin** — `get_current_time` tool that returns the current Unix timestamp
6. **SandboxPlugin** — Drains all above tools and exposes them as JS functions inside a QuickJS sandbox (see [Code Sandbox](./code-sandbox.md))

Because `SandboxPlugin` is registered last, the LLM sees only `run_code` and `inspect_tool`. It writes JavaScript that calls `echo()`, `get_current_time()`, `fs_read()`, `cli_exec()`, etc. as regular functions.

## Output Formats

### Human-readable (default)

Tool calls and metadata go to stderr; the agent's text response goes to stdout. This means you can pipe just the agent's answer:

```
$ aperture-playground "What time is it?" 2>/dev/null
The current time is Wednesday, March 4, 2026, at 18:42:16 UTC.
```

Full output (with stderr visible):

```
$ aperture-playground "What time is it?"
[tool: run_code]
  input:  {"code":"const t = get_current_time();\nnew Date(t.unix_timestamp * 1000).toUTCString();"}
  result: {"console_output":[],"value":"Wed, 04 Mar 2026 18:42:16 GMT"}
The current time is Wednesday, March 4, 2026, at 18:42:16 UTC.
tokens: 384 prompt + 22 completion = 406 total
```

### JSON (`--json`)

All output goes to stdout as a single JSON object:

```json
{
  "state": "Completed",
  "outputs": [
    {
      "type": "tool",
      "tool_id": "run_code",
      "input": { "code": "..." },
      "result": {
        "status": "success",
        "output": { "console_output": [], "value": "Wed, 04 Mar 2026 18:42:16 GMT" }
      }
    },
    {
      "type": "text",
      "content": "The current time is Wednesday, March 4, 2026, at 18:42:16 UTC."
    }
  ],
  "usage": {
    "prompt_tokens": 384,
    "completion_tokens": 22,
    "total_tokens": 406
  }
}
```

Use `--json` for automated testing, benchmarking, or piping into `jq`:

```bash
# Extract just the agent's text response
aperture-playground --json "What time is it?" | jq -r '.outputs[] | select(.type == "text") | .content'

# Check if any tools errored
aperture-playground --json "Do something" | jq '[.outputs[] | select(.type == "tool" and .result.status == "error")]'
```

## Architecture

The playground implements `LlmClient` via `OpenAiClient`, which converts between Aperture's `LlmMessage` types and the OpenAI wire format (`ChatMessage`, `ChatToolCall`, etc.). Consecutive `ToolCall` messages are grouped into a single assistant message with a `tool_calls` array, matching OpenAI's expected format.

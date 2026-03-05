# Agent Loop

The agent loop is the core execution engine. It implements a **prepare → call → process** cycle that runs until the model produces a text response or a maximum round limit is reached.

## Design Goals

The agent loop solves a specific problem: **LLM APIs have a narrow output vocabulary** (text and tool calls), but agent applications need richer output types — approval checkpoints, file attachments, display data. This design introduces a **prompt-level output model** that is wider than what the LLM sees, with a translation layer that collapses it back to the LLM's message format.

Key principles:

- **One input, many outputs** — A prompt has one optional user input and an ordered list of typed outputs
- **Outputs are a superset of LLM capabilities** — The output list can contain types the LLM never produced (files, approval checkpoints)
- **Selective projection into LLM messages** — Only LLM-relevant outputs are included when building the next model call
- **Human-in-the-loop as a first-class state** — Approval is a tool result type (`Pending`), not a separate workflow
- **Plugin-contributed tools and context** — Available tools and system context are rebuilt before every model call

## Data Model

### Prompt

A `Prompt` represents a single turn of agent execution — one user message triggering zero or more rounds of model calls and tool invocations.

```rust
pub struct Prompt {
    pub id: String,
    pub user_id: String,
    pub state: PromptState,
    pub input: Option<String>,
    pub output: Vec<PromptOutput>,
    pub usage: Option<PromptUsage>,
}

pub enum PromptState {
    Running,
    Completed,
    WaitingForApproval,
}
```

`input` is optional because prompts can be system-initiated (triggers, scheduled tasks) with no user message.

### PromptOutput

Every output entry is a tagged enum. The list is extensible — new variants can be added without changing the agent loop:

```rust
pub enum PromptOutput {
    Text(TextOutput),
    Tool(ToolOutput),
    File(FileOutput),
}
```

| Variant | Produced by | Sent to LLM? | Purpose |
|---------|------------|---------------|---------|
| `Text` | Model response | Yes (as assistant message) | Natural language output |
| `Tool` | Tool invocation | Yes (as function_call + result) | Tool call with input and result |
| `File` | Tool (via callback) | Yes (as text summary) | File artifacts for the user |

### Tool Results

A tool output's result has three possible states:

```rust
pub enum ToolResult {
    Success { output: serde_json::Value },
    Error { error: String },
    Pending { reason: String },
}
```

`Pending` represents a tool call waiting for human approval. When approved, it is replaced in-place with `Success` or `Error`. The output list is a complete, ordered timeline including pauses.

## The Loop

```
                    ┌─────────┐
                    │  START  │
                    └────┬────┘
                         ▼
              ┌──────────────────────┐
         ┌───▶│      PREPARE         │
         │    │  Call prepare() on   │
         │    │  all plugins.        │
         │    │  Collect tools +     │
         │    │  context items.      │
         │    └──────────┬───────────┘
         │               ▼
         │    ┌──────────────────────┐
         │    │     CALL MODEL       │
         │    │  Build messages from │
         │    │  context + history.  │
         │    │  Send to LLM.       │
         │    └──────────┬───────────┘
         │               ▼
         │         ┌───────────┐
         │         │ Response? │
         │         └─────┬─────┘
         │          text │  │ tool calls
         │               │  ▼
         │               │ ┌──────────────────────┐
         │               │ │   INVOKE TOOLS       │
         │               │ │  Validate input.     │
         │               │ │  Check approval.     │
         │               │ │  Execute or pause.   │
         │               │ │  Record results.     │
         │               │ └──────────┬───────────┘
         │               │            │
         │               │   ┌────────┴────────┐
         │               │   │ Approval needed? │
         │               │   └──┬───────────┬──┘
         │               │   no │           │ yes
         │               │      │           ▼
         │               │      │    ┌────────────┐
         │               │      │    │   PAUSE    │
         │               │      │    │  (exit)    │
         │               │      │    └────────────┘
         └───────────────┘◀─────┘
                         │
                         ▼
                  ┌────────────┐
                  │  COMPLETE  │
                  └────────────┘
```

### Prepare Phase

Every iteration rebuilds the tool set and system context from scratch by calling `prepare()` on all registered plugins. Plugins can:

- **Add tools** based on conversation state (e.g., activate/deactivate skills)
- **Add context items** (system instructions) based on what happened so far
- **Read and write state** to coordinate across plugins

This means the model's capabilities change dynamically during execution. A skill activated via tool call in round 1 becomes available in round 2's prepare phase.

### Message Projection

The output list is the full record. The LLM only sees a subset. The projection function converts the rich output list into LLM messages:

- `Text` → assistant message
- `Tool` → function_call + function_call_output pair
- `File` → assistant message (text summary of the file)

Future output types that are display-only are simply skipped during projection.

### Tool Invocation

Tools receive a `ToolContext` with everything they need:

```rust
pub struct ToolContext {
    pub user_id: String,
    pub input: serde_json::Value,
    pub state: State,
    pub extensions: Extensions,
    pub events: EventBus,
}
```

Tools can access services from other plugins via the `extensions` type map (see [Services](./services.md)). They can also emit side-channel outputs (files) during invocation via callbacks, which are inserted into the output list immediately after the tool's own entry.

## Human-in-the-Loop

### Approval as a Tool Result State

Any tool can declare `require_approval`. When approval is needed:

1. The tool result is recorded as `Pending { reason }` in the output list
2. The prompt state becomes `WaitingForApproval`
3. A `prompt.approval-requested` event fires
4. Any remaining tool calls in the batch are deferred
5. The loop exits

### Resumption

External code calls `approve(tool_call_id)` or `reject(tool_call_id, reason)`:

- **Approve**: The tool is invoked. `Pending` is replaced with `Success` or `Error`. Deferred calls are processed. The loop resumes.
- **Reject**: `Pending` is replaced with `Error`. The model sees it as a failed tool call and adapts. The loop resumes.

## Conversation

A conversation is a sequence of prompts. When creating a new prompt, all prior prompts are passed as history. The projection function flattens them — for each prior prompt, the `input` becomes a `user` message and the outputs are projected into LLM message types.

```
Conversation
├── Prompt 1: "What's the weather?"
│   ├── Tool: weather.get → success
│   └── Text: "Here's the forecast..."
│
├── Prompt 2: "Schedule a reminder"
│   ├── Tool: trigger.create → pending → success (after approval)
│   └── Text: "Done."
│
└── Prompt 3: (trigger-initiated, no input)
    └── Text: "Your reminder: check the forecast"
```

## Design Advantages

1. **Output types are extensible without changing the loop** — New `PromptOutput` variants only need a skip/project rule.
2. **The output list is the single source of truth** — Every response, tool call, result, file, and pause is recorded in order.
3. **Human-in-the-loop is not a separate system** — It's a tool result state, not a workflow engine.
4. **Dynamic tool and context assembly** — `prepare()` runs every iteration, enabling progressive disclosure.
5. **Clean separation between model protocol and application protocol** — The application thinks in `PromptOutput`, the model thinks in messages. `project_to_messages()` bridges the two.

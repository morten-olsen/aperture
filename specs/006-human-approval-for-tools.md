# 006: Human Approval for Tools

**Status**: Draft

## Overview

Some tool invocations are high-risk and should require explicit human approval before executing. This spec introduces an opt-in approval gate on tools so the agent loop pauses, fires an event, persists the pending state, and resumes only when a human approves or rejects the call. The design survives server restarts and integrates with Telegram as the first approval channel.

## Scope

### Included

- `requireApproval` option on `Tool` type (static object or async function)
- New `pending` tool-result variant and `waiting_for_approval` prompt state
- Pause/resume/reject lifecycle on `PromptCompletion`
- Persistence of pending approval state in the prompt store
- Resumption of pending prompts after server restart
- `approval-requested` event on both `PromptCompletion` and `PromptService`
- Telegram inline-keyboard integration for approve/reject
- `web-fetch` plugin: static approval gate on `web-fetch.add-domain`, dynamic gate on `web-fetch.fetch` for non-whitelisted domains

### Out of scope

- Multi-user approval quorum (single approver is sufficient)
- Audit log / approval history table (existing prompt output captures the decision)
- Web UI for approvals (Telegram only for now)
- Per-user approval permission model

## Data Model

### Tool type extension

```typescript
type ApprovalRequest = {
  required: boolean;
  reason: string;
};

type RequireApproval<TInput extends ZodType> = (
  input: ToolInput<TInput>,
) => Promise<ApprovalRequest> | ApprovalRequest;

// Added to Tool<TInput, TOutput>
type Tool<TInput, TOutput> = {
  // ... existing fields
  requireApproval?: ApprovalRequest | RequireApproval<TInput>;
};
```

- **Static**: `{ required: true, reason: 'Adds a new domain to the allowlist' }` — always requires approval.
- **Dynamic**: An async function that receives the same `ToolInput` as `invoke` and returns `{ required, reason }`. Useful when approval depends on input (e.g., `web-fetch.fetch` only needs approval if the domain isn't already whitelisted).

### Prompt schema changes

New tool-result variant:

```typescript
const promptOutputToolResultPendingSchema = z.object({
  type: z.literal('pending'),
  reason: z.string(),
});
```

Add to discriminated union:

```typescript
const promptOutputToolResultSchema = z.discriminatedUnion('type', [
  promptOutputToolResultSuccessSchema,
  promptOutputToolResultErrorSchema,
  promptOutputToolResultPendingSchema,   // new
]);
```

New prompt state:

```typescript
state: z.enum(['running', 'completed', 'waiting_for_approval'])
```

### Prompt store (database)

No schema migration needed — the `state` column is `VARCHAR(50)` and `output` is JSON text. The new `'waiting_for_approval'` state value and `'pending'` result type are stored within existing columns.

The prompt store listener must be updated to persist state on `'updated'` events (not only on `'completed'`), so the pending state survives a crash.

## API / Service Layer

### PromptCompletion — new methods and events

```typescript
type PromptCompletionEvents = {
  updated: (completion: PromptCompletion) => void;
  completed: (completion: PromptCompletion) => void;
  'approval-requested': (completion: PromptCompletion, request: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    reason: string;
  }) => void;  // new
};
```

New public methods:

```typescript
// Approve a pending tool call — invokes the tool and resumes the loop
public approve(toolCallId: string): Promise<void>;

// Reject a pending tool call — records an error result and resumes the loop
public reject(toolCallId: string, reason?: string): Promise<void>;
```

### Agent loop changes (`run()`)

Inside `#executeToolCall`, after Zod validation and **before** `tool.invoke()`:

1. Evaluate `requireApproval`: if the tool has `requireApproval`, call it (if function) or read it (if static). If `required` is `false`, proceed normally.
2. If `required` is `true`:
   - Push a tool output with `result: { type: 'pending', reason }` onto `this.#prompt.output`.
   - Set `this.#prompt.state = 'waiting_for_approval'`.
   - Emit `'updated'` (so the prompt store persists the pending state).
   - Emit `'approval-requested'` with the tool call details.
   - **Return from `run()`** — the loop exits. The prompt is now suspended.

When `approve(toolCallId)` is called:

1. Find the pending tool output by `id === toolCallId`.
2. Look up the tool in the current prepared tools list (re-run `#prepare()`).
3. Invoke the tool normally.
4. Replace the pending result with the actual `success` or `error` result.
5. Set `this.#prompt.state = 'running'`.
6. Re-enter the `run()` loop (call `this.run()` — which continues from the current round).

When `reject(toolCallId, reason?)` is called:

1. Find the pending tool output by `id === toolCallId`.
2. Replace the pending result with `{ type: 'error', error: reason || 'Rejected by user' }`.
3. Set `this.#prompt.state = 'running'`.
4. Re-enter the `run()` loop.

### PromptService — tracking active completions and bubbling events

To support resume after restart and external `approve`/`reject` calls, `PromptService` must track active `PromptCompletion` instances. It also re-emits `approval-requested` so consumers (e.g., Telegram) can subscribe in one place instead of wiring per-completion listeners:

```typescript
type PromptServiceEvents = {
  created: (completion: PromptCompletion) => void;
  'approval-requested': (completion: PromptCompletion, request: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    reason: string;
  }) => void;  // new — bubbled up from PromptCompletion
};

class PromptService {
  // Existing
  public create(...): PromptCompletion;

  // New: retrieve a running or waiting completion by prompt ID
  public getActive(promptId: string): PromptCompletion | undefined;
}
```

Internally, maintain a `Map<string, PromptCompletion>`. Entries are added on `create()` and removed on `'completed'`.

In `create()`, wire up forwarding:

```typescript
completion.on('approval-requested', (completion, request) => {
  this.emit('approval-requested', completion, request);
});
```

This means both levels are available — `PromptCompletion` for fine-grained per-completion listening, and `PromptService` for global listening across all completions.

### Prompt store — intermediate persistence

Update `PromptStoreService.listen()` to also persist on `'updated'`:

```typescript
completion.on('updated', async () => {
  await db
    .updateTable('db_prompts')
    .set({
      state: completion.prompt.state,
      output: JSON.stringify(completion.prompt.output),
    })
    .where('id', '=', completion.id)
    .execute();
});
```

This ensures the `waiting_for_approval` state and the pending tool output are persisted before the process potentially crashes.

### Server restart recovery

On startup (e.g., during prompt store `listen()` or a dedicated recovery method):

1. Query `db_prompts WHERE state = 'waiting_for_approval'`.
2. For each row, reconstruct the `PromptCompletion` with the persisted prompt data and history.
3. Register it in `PromptService`'s active map.
4. Re-emit `'approval-requested'` so listeners (e.g., Telegram) can re-send approval buttons.

The conversation package also needs to be recovery-aware — when it loads history for a conversation that includes a `waiting_for_approval` prompt, it should check if the completion is already active in `PromptService` and wire up its event listeners.

## Tool Definitions

No new tools are introduced. Existing tools gain the optional `requireApproval` field.

## Plugin Behavior

### Telegram plugin

In `setup()`, listen for the service-level `'approval-requested'` event on `PromptService`. This fires for all completions, so Telegram doesn't need per-completion wiring:

```typescript
promptService.on('approval-requested', async (completion, request) => {
  const chatId = telegramCompletions.get(completion.id);
  if (!chatId) return;

  const botService = services.get(TelegramBotService);
  await botService.sendMessageWithKeyboard(chatId, {
    text: `🔐 Approval required for **${request.toolName}**\n\n${request.reason}\n\nInput: \`${JSON.stringify(request.input)}\``,
    keyboard: [
      [
        { text: '✅ Approve', callbackData: `approve:${completion.id}:${request.toolCallId}` },
        { text: '❌ Reject', callbackData: `reject:${completion.id}:${request.toolCallId}` },
      ],
    ],
  });
});
```

Handle callback queries:

```typescript
botService.bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const [action, promptId, toolCallId] = data.split(':');

  const completion = promptService.getActive(promptId);
  if (!completion) {
    await ctx.answerCallbackQuery({ text: 'This approval request has expired.' });
    return;
  }

  if (action === 'approve') {
    await completion.approve(toolCallId);
    await ctx.answerCallbackQuery({ text: 'Approved' });
  } else if (action === 'reject') {
    await completion.reject(toolCallId, 'Rejected by user via Telegram');
    await ctx.answerCallbackQuery({ text: 'Rejected' });
  }
});
```

Note: `sendMessageWithKeyboard` is a new method on `TelegramBotService` that sends a message with inline keyboard buttons.

### Web-fetch plugin

Two approval gates:

1. **`web-fetch.add-domain`** — Static approval:
   ```typescript
   requireApproval: {
     required: true,
     reason: 'Adding a domain to the allowlist grants permanent fetch access.',
   }
   ```

2. **`web-fetch.fetch`** — Dynamic approval:
   ```typescript
   requireApproval: async ({ input, services }) => {
     const { WebFetchService } = await import('../service/service.js');
     const service = services.get(WebFetchService);
     const domain = new URL(input.url).hostname.toLowerCase();
     const allowed = await service.isAllowed(domain);
     return {
       required: !allowed,
       reason: allowed
         ? `Domain "${domain}" is on the allowlist.`
         : `Domain "${domain}" is not on the allowlist. Approval required to fetch.`,
     };
   }
   ```

   With this change the `web-fetch.fetch` tool no longer throws on non-whitelisted domains — instead it gates on human approval, and if approved, fetches directly (bypassing the allowlist check for that single invocation). The `web-fetch.add-domain` tool still exists for permanently whitelisting domains.

## Error Handling

| Failure | Recovery |
|---|---|
| Server crashes while `waiting_for_approval` | On restart, recovery loads pending prompts from DB and re-emits approval requests |
| User never responds to approval request | No timeout — prompt stays in `waiting_for_approval` until explicit action. A future spec may add TTL. |
| Tool invocation fails after approval | Normal error flow — result is `{ type: 'error' }`, agent loop continues |
| `approve()` called on non-pending prompt | No-op, log a warning |
| Multiple approvals for same tool call | First call wins, subsequent calls are no-ops |
| Callback data references expired completion | Telegram handler returns "expired" answer to callback query |

## Configuration

No new configuration options. The feature is opt-in per tool via `requireApproval`.

## Boundary

### This spec owns

- `Tool` type extension with `requireApproval`
- Prompt schema additions (`pending` result, `waiting_for_approval` state)
- `PromptCompletion` pause/resume/reject lifecycle
- `PromptService` active-completion tracking
- Prompt store intermediate persistence and startup recovery
- Telegram inline-keyboard approval flow
- Web-fetch approval gates

### Other packages handle

- `conversation` — wiring up event listeners when loading existing conversations; no structural changes needed beyond awareness of the new prompt state
- `database` (DatabaseService) — no changes, existing Kysely infrastructure is sufficient
- Future approval channels (web UI, Slack, etc.) — separate specs

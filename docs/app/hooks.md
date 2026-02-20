# Hooks

React hooks for the Expo client app, located in `apps/expo/src/hooks/`.

## useAgenticClient

`use-client.tsx` — provides the `AgenticClient` instance via React context.

```tsx
// In a component:
const client = useAgenticClient();
```

Must be used within `<AgenticClientProvider>`, which is set up in the root layout (`app/_layout.tsx`).

## useToolQuery

`use-tools.ts` — wraps `client.invokeTool` with TanStack `useQuery` for read operations. Fully typed via the generated tool types.

```ts
// Input and output are type-checked against the tool's schema
const { data, isLoading, refetch } = useToolQuery('conversation.list', {});
data?.result.conversations; // typed as { id: string; createdAt: string; updatedAt: string }[]
```

- **Query key**: `['tool', toolId, input]` — automatically refetches when input changes
- **Type safety**: passing a wrong input shape (e.g. `{ conversationId: id }` instead of `{ id }`) is a compile error

## useToolInvoke

`use-tools.ts` — wraps `client.invokeTool` with TanStack `useMutation` for write operations.

```ts
const createConversation = useToolInvoke('conversation.create');

// In a handler:
const result = await createConversation.mutateAsync({});
result.result.id; // typed as string
```

## usePrompt

`use-prompt.ts` — manages the lifecycle of a single prompt. Sends the prompt via REST, then subscribes to SSE events for streaming results.

```ts
const { send, outputs, pendingApproval, isStreaming, error, approve, reject } = usePrompt();

// Send a prompt
send('Hello', { conversationId: 'abc', model: 'normal' });

// Approve/reject a tool call that requires human approval
await approve(pendingApproval.toolCallId);
await reject(pendingApproval.toolCallId, 'Not now');
```

### State

| Field | Type | Description |
|---|---|---|
| `promptId` | `string \| null` | ID of the active prompt |
| `outputs` | `PromptOutput[]` | Streamed output entries (text, tool calls) |
| `pendingApproval` | `ApprovalRequest \| null` | Tool call waiting for user approval |
| `isStreaming` | `boolean` | True while prompt is running |
| `error` | `Error \| null` | Error if the prompt failed |

### Flow

1. `send()` calls `client.sendPrompt()` (REST) to start the prompt
2. Subscribes to `client.events.subscribeToPrompt(promptId, ...)` for SSE updates
3. `prompt.output` events append to `outputs`
4. `prompt.approval` events set `pendingApproval`
5. `prompt.completed` sets `isStreaming = false`
6. Previous subscription is cleaned up when `send()` is called again or on unmount

## useEventStream

`use-event-stream.ts` — connects the SSE event stream on mount and disconnects on unmount. Used once in the root layout via the `EventStreamConnector` component.

```ts
const events = useEventStream();
// events is the EventStream instance (rarely used directly)
```

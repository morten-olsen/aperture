# 007: Display Widgets

**Status**: Draft

## Overview

Plugins often produce data that benefits from rich rendering — weather forecasts, charts, tables, maps. Today, tools return opaque JSON that the model processes as text and transports display as-is. This spec introduces **display widgets**: a first-class prompt output type alongside `text` and `tool`, plus a `displayWidget` callback that any tool can call during invocation to emit one or more widgets. This keeps the widget concept decoupled from the tool return value — a data-fetching tool can simultaneously return structured data to the model AND emit a visual widget for the user.

## Scope

### Included

- `PromptOutputWidget` — new variant in the prompt output discriminated union
- `displayWidget` callback on `ToolInput` — any tool can emit widgets during invocation
- Model feedback: `promptsToMessages()` skips widget outputs (model already has the tool result)
- Usage patterns for plugin authors and rendering layers

### Out of scope

- Widget renderers (each platform — server, playground, Telegram — implements its own)
- Specific widget type definitions (each plugin defines its own)
- Widget interactivity (clicks, form inputs — future spec)
- Widget type registry / discovery service (can be added later when there's a concrete consumer)

## Data Model

### Prompt output schema

A new `PromptOutputWidget` variant is added to the prompt output discriminated union:

```typescript
const promptOutputWidgetSchema = promptOutputBase.extend({
  type: z.literal('widget'),
  widget: z.string(),     // Widget type identifier, e.g. 'weather-forecast'
  data: z.unknown(),      // Payload specific to this widget type
  fallback: z.string(),   // Plain-text representation for non-widget-aware consumers
});

type PromptOutputWidget = z.input<typeof promptOutputWidgetSchema>;
```

The discriminated union becomes:

```typescript
const promptOutputSchema = z.discriminatedUnion('type', [
  promptOutputTextSchema,
  promptOutputToolSchema,
  promptOutputWidgetSchema,
]);

type PromptOutput = z.input<typeof promptOutputSchema>;
```

Widget outputs appear inline in `prompt.output` immediately after the tool output that emitted them. A single tool invocation can emit zero, one, or many widgets:

```
[ tool(weather.get), widget(weather-forecast), widget(weather-map), text("Here's the forecast") ]
```

### Tool input extension

`ToolInput` gains an optional `displayWidget` callback:

```typescript
type ToolInput<TInput extends ZodType> = {
  userId: string;
  input: z.input<TInput>;
  state: State;
  services: Services;
  displayWidget?: (widget: string, data: unknown, fallback: string) => void;
};
```

The callback is optional so that `requireApproval` (which also receives `ToolInput`) is unaffected — `displayWidget` is only provided during actual tool invocation.

### Persistence

No database schema changes. Widget outputs are serialised as part of the `prompt.output` JSON array, which is stored as text in the existing `output` column of `db_prompts`. The new `'widget'` type value is handled within the existing column.

## API / Service Layer

### Changes to `prompt.schema.ts`

Add `promptOutputWidgetSchema` and `PromptOutputWidget`. Add the widget variant to the `promptOutputSchema` discriminated union. Export both the schema and type.

### Changes to `tool/tool.types.ts`

Add optional `displayWidget` to `ToolInput`:

```typescript
type ToolInput<TInput extends ZodType> = {
  userId: string;
  input: z.input<TInput>;
  state: State;
  services: Services;
  displayWidget?: (widget: string, data: unknown, fallback: string) => void;
};
```

### Changes to `prompt.completion.ts`

A new private helper `#invokeTool` encapsulates the `displayWidget` callback setup, tool invocation, and widget collection:

```typescript
#invokeTool = async (
  tool: Tool,
  args: unknown,
  state: State,
): Promise<{ result: unknown; widgets: PromptOutputWidget[] }> => {
  const widgets: PromptOutputWidget[] = [];
  const now = new Date().toISOString();

  const displayWidget = (widget: string, data: unknown, fallback: string) => {
    widgets.push({ type: 'widget', widget, data, fallback, start: now });
  };

  const result = await tool.invoke({
    input: args,
    userId: this.userId,
    state,
    services: this.#options.services,
    displayWidget,
  });

  return { result, widgets };
};
```

`#executeToolCall` uses `#invokeTool` and returns widgets alongside the tool output:

```typescript
#executeToolCall = async (
  toolCall: OpenAI.Responses.ResponseFunctionToolCall,
  tools: Tool[],
  state: State,
): Promise<{ tool: PromptOutputTool; widgets: PromptOutputWidget[] }> => {
  // ... existing error/parse/approval paths return { tool: errorOutput, widgets: [] }

  const { result, widgets } = await this.#invokeTool(tool, args, state);
  return {
    tool: {
      id: toolCall.call_id,
      type: 'tool',
      function: toolCall.name,
      input: args,
      result: { type: 'success', output: result },
      start,
      end: new Date().toISOString(),
    },
    widgets,
  };
};
```

`#processToolCalls` pushes both the tool output and any widgets:

```typescript
const { tool: output, widgets } = await this.#executeToolCall(toolCalls[i], tools, state);
this.#prompt.output.push(output, ...widgets);
```

`approve()` uses `#invokeTool` and pushes widgets after updating the pending result:

```typescript
const { result, widgets } = await this.#invokeTool(tool, pendingOutput.input, this.#state);
pendingOutput.result = { type: 'success', output: result };
pendingOutput.end = new Date().toISOString();
this.#prompt.output.push(...widgets);
```

### Changes to `prompt.utils.ts`

`promptsToMessages()` skips widget entries. Widgets are display-only — the model already receives the tool's return value through the normal `function_call_output` message:

```typescript
for (const output of prompt.output) {
  if (output.type === 'widget') continue;
  // ... existing text and tool handling
}
```

### No changes to

- `plugin/` — plugin types and lifecycle are unchanged
- `prompt.service.ts` — no structural changes
- Database migrations — existing columns handle the new output type

## Tool Definitions

No framework-level tools are introduced. Plugins define their own widget-emitting tools.

### Pattern A: Dedicated widget tool

A tool whose sole purpose is to display a widget:

```typescript
const showForecastTool = createTool({
  id: 'weather.show-forecast',
  description: 'Displays a weather forecast widget for a given city.',
  input: z.object({ city: z.string() }),
  output: z.object({ displayed: z.boolean() }),
  invoke: async ({ input, services, displayWidget }) => {
    const data = await fetchWeather(input.city);
    displayWidget?.('weather-forecast', data, [
      `Weather for ${input.city}: ${data.temperature}°C, ${data.conditions}`,
      ...data.forecast.map((d: Forecast) => `  ${d.day}: ${d.low}–${d.high}°C`),
    ].join('\n'));
    return { displayed: true };
  },
});
```

### Pattern B: Tool that incidentally emits a widget

A data tool that also displays a rich view when available:

```typescript
const getWeatherTool = createTool({
  id: 'weather.get',
  description: 'Gets weather data for a city. Also shows a visual forecast.',
  input: z.object({ city: z.string() }),
  output: weatherDataSchema,
  invoke: async ({ input, services, displayWidget }) => {
    const data = await fetchWeather(input.city);
    displayWidget?.('weather-forecast', data, `${input.city}: ${data.temperature}°C`);
    return data;
  },
});
```

The model receives the full `data` as the tool result. The UI receives the widget. Both happen from a single tool call.

### Pattern C: Multiple widgets from one tool

```typescript
const showDashboardTool = createTool({
  id: 'dashboard.show',
  description: 'Shows a summary dashboard with weather and calendar.',
  input: z.object({}),
  output: z.object({ displayed: z.boolean() }),
  invoke: async ({ services, displayWidget }) => {
    const weather = await getWeather();
    const events = await getCalendarEvents();
    displayWidget?.('weather-forecast', weather, `${weather.temperature}°C`);
    displayWidget?.('calendar-day', events, events.map((e) => e.title).join(', '));
    return { displayed: true };
  },
});
```

## Plugin Behavior

Widgets do not introduce any new plugin lifecycle hooks or APIs. A plugin that provides widgets:

1. Defines tool(s) that call `displayWidget` during invocation
2. Pushes them into `tools` during `prepare()`

Optionally, the plugin can add context instructions guiding the model on when to use widget tools:

```typescript
prepare: async ({ tools, context }) => {
  tools.push(showForecastTool, getWeatherTool);
  context.items.push({
    type: 'instruction',
    content: 'When the user asks about weather, prefer using weather.show-forecast to display a visual forecast.',
  });
},
```

## Rendering

Rendering is outside core but described here for completeness.

### Detection pattern

The rendering layer iterates `prompt.output` and handles widget entries directly by their `type`:

```typescript
for (const output of prompt.output) {
  if (output.type === 'widget') {
    const renderer = renderers.get(output.widget);
    if (renderer) {
      await renderer.render(output.data);
    } else {
      display(output.fallback);
    }
  }
  // ... handle text and tool outputs
}
```

No type guard needed — the discriminated union gives type-safe access to `output.widget`, `output.data`, and `output.fallback` when `output.type === 'widget'`.

### Fallback

Platforms that don't support widgets at all can ignore `type: 'widget'` entries entirely — the model's text response provides the conversational summary, and the tool's return value (which the model used to generate that summary) contains the raw data.

Platforms that support some widget types render what they can and display `fallback` for unrecognised types.

## Error Handling

| Failure | Recovery |
|---|---|
| `displayWidget` called with invalid arguments | Widget is still pushed (data is `unknown`); renderer validates at display time |
| Unknown widget type at render time | Rendering layer displays `fallback` text |
| Widget data doesn't match renderer's expectations | Renderer validates and falls back to `fallback` on failure |
| Tool throws after emitting widgets | Widgets emitted before the error are discarded (not pushed to output); tool result is `error` |
| `displayWidget` called in `requireApproval` | Not possible — callback is not provided during approval evaluation |

## Configuration

No configuration options. Widgets are opt-in per tool via the `displayWidget` callback.

## Boundary

### This spec owns

- `PromptOutputWidget` schema and type in `prompt.schema.ts`
- `displayWidget` callback on `ToolInput` in `tool.types.ts`
- Widget collection and output in `prompt.completion.ts`
- Widget skipping in `promptsToMessages()`

### Other packages handle

- Rendering widgets to specific platforms (server, playground, Telegram)
- Defining specific widget types and their data schemas (each plugin)

## Future Considerations

### Widget type registry

If the number of widget types grows, a `WidgetService` could let plugins declare their types during `setup()`:

```typescript
widgetService.register({
  type: 'weather-forecast',
  name: 'Weather Forecast',
  dataSchema: weatherDataSchema,
});
```

This would enable UI auto-discovery of available widgets and runtime validation of widget data. Deferred until there is a concrete consumer.

### Interactive widgets

Widgets that accept user input (buttons, form fields) would need a callback mechanism — likely a tool that the rendering layer invokes when the user interacts. This is a larger design effort and is out of scope.

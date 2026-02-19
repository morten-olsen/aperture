# Interpreter Plugin

The interpreter plugin executes JavaScript code in a sandboxed QuickJS environment. The sandbox has no access to Node.js APIs, the filesystem, or the network — only explicitly exposed functions and modules are available. This makes it safe for the agent to run computations, transform data, and prototype logic.

## Registration

```typescript
import { interpreterPlugin } from '@morten-olsen/agentic-interpreter';

await pluginService.register(interpreterPlugin);
```

No configuration options. Plugin ID: `'interpreter'`.

## Available Tools

### `interpreter.run-code`

Run JavaScript code in the sandbox. The last expression is the return value.

```typescript
// Input
{
  code: "const items = input.data.map(x => x * 2); items",
  input: { data: [1, 2, 3] }  // optional — available as global `input`
}

// Output (the last expression value)
[2, 4, 6]
```

**Globals:**
- `input` — the provided input object (or `null` if omitted)

**Not available:** `fetch`, `require`, `process`, `fs`, `setTimeout`, or any browser/Node APIs unless explicitly exposed.

## Extending the Sandbox

Other plugins can extend the interpreter by registering host functions and modules via `InterpreterService`:

### Exposing Host Functions

```typescript
import { InterpreterService } from '@morten-olsen/agentic-interpreter';

const interpreter = services.get(InterpreterService);

// Register an async host function callable from sandbox code
interpreter.expose(
  'fetchPrice',
  'Fetch the current price for a stock ticker',
  async (ticker: unknown) => {
    const price = await getStockPrice(String(ticker));
    return price;
  },
);
```

Exposed functions are automatically listed in the tool description so the agent knows what's available.

### Adding Modules

```typescript
interpreter.addModule(
  'math-utils',
  'export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);',
);
```

Registered modules can be imported in sandbox code:

```javascript
import { clamp } from 'math-utils';
clamp(input.value, 0, 100);
```

## Dependencies

- `@morten-olsen/agentic-core` — plugin and tool definitions
- `quickjs-emscripten` — sandboxed JavaScript engine (async variant)

# Expo Client App

The Expo app (`apps/expo/`) is a React Native + Web client that connects to the GLaDOS API server. It uses Expo Router for navigation, Tamagui for UI, and TanStack Query for data fetching.

## Running

```bash
pnpm --filter @morten-olsen/agentic-expo start       # Start Expo dev server
pnpm --filter @morten-olsen/agentic-expo start:web    # Start in web mode
pnpm --filter @morten-olsen/agentic-expo storybook    # Start Storybook
pnpm --filter @morten-olsen/agentic-expo generate     # Regenerate typed tool bindings
```

The app expects a running API server. Configure the URL via the Settings tab or the `EXPO_PUBLIC_API_URL` env var (default: `http://localhost:3000/api`).

## Directory Structure

```
apps/expo/
├── app/                        Expo Router file-based routes
│   ├── _layout.tsx             Root layout (providers, SSE connection)
│   ├── (tabs)/
│   │   ├── _layout.tsx         Tab bar (Conversations, Settings)
│   │   ├── index.tsx           Conversation list screen
│   │   └── settings.tsx        Server URL / User ID settings
│   └── conversation/
│       └── [id].tsx            Chat screen for a single conversation
├── scripts/
│   └── generate-tool-types.ts  Codegen script for typed tool bindings
├── src/
│   ├── client/                 API client layer
│   ├── components/             UI components (chat, markdown, etc.)
│   ├── generated/              Auto-generated types (eslint-ignored)
│   ├── hooks/                  React hooks
│   └── theme/                  Tamagui config
├── tools.snapshot.json         Saved /api/tools response for offline codegen
└── .storybook/                 Storybook configuration
```

## Detailed Documentation

- [Design Principles](./design-principal.md) — Visual language, color system, component patterns
- [Client](./client.md) — API client, SSE events, platform abstraction
- [Hooks](./hooks.md) — React hooks for tools, prompts, and events
- [Codegen](./codegen.md) — Typed tool bindings and the generate script

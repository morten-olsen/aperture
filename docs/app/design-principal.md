# Design Principles

Design language for the Aperture client app. These principles guide every component, screen, and interaction.

---

## Navigation Architecture

Aperture is a **chat-first AI personal assistant**. The navigation hierarchy reflects this: conversation is primary, everything else supports it.

### Core Philosophy

1. **Instant Interaction**: When the app opens, the user should be able to start talking immediately — no menu traversal required.
2. **Conversation is Home**: The chat interface is the default view, not a destination.
3. **Utilities Recede**: Management features (triggers, blueprints, secrets) are important but secondary — they configure the assistant, not replace it.
4. **Tasks Surface Naturally**: Tasks have special status as a user-facing feature that bridges chat and productivity.

### Screen Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRIMARY LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐  ┌──────────────────────────────────────┐   │
│  │  Conversation  │  │            CHAT (Home)               │   │
│  │    Sidebar     │  │                                      │   │
│  │                │  │  The active conversation.            │   │
│  │  • Recent      │  │  Input bar always visible.           │   │
│  │  • Search      │  │  Send a message immediately.         │   │
│  │  • + New       │  │                                      │   │
│  │                │  │                         ┌──────────┐ │   │
│  │  [Persistent   │  │                         │ Settings │ │   │
│  │   on tablet/   │  │                         │  (gear)  │ │   │
│  │   desktop]     │  │                         └────┬─────┘ │   │
│  └────────────────┘  └──────────────────────────────┼───────┘   │
│                                                     ▼           │
│                                          ┌──────────────────┐   │
│                                          │  Settings Sheet  │   │
│                                          │                  │   │
│                                          │  • Account       │   │
│                                          │  • Secrets       │   │
│                                          │  • Triggers      │   │
│                                          │  • Blueprints    │   │
│                                          │  • Tasks         │   │
│                                          │  • Appearance    │   │
│                                          └──────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        DETAIL LAYER                             │
│                    (Contextual screens)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Secret Detail │ Trigger Detail │ Blueprint Detail │ Task Detail│
│                                                                 │
│   Pushed onto stack from Settings. Back returns to Settings.    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Navigation Patterns

#### Chat Screen (Home)

The chat screen is the app's home. It displays the **active conversation** as tracked by the backend. The backend maintains an `activeConversation` concept — the app simply renders whatever conversation is currently active.

| Element | Behavior |
|---------|----------|
| **Header left** | Tap to open Conversation Drawer (slide-over or bottom sheet) |
| **Header center** | Conversation title (tappable to rename) |
| **Header right** | Settings gear icon → opens Settings Sheet |
| **Message area** | Scrollable chat history with smart spacing |
| **Input bar** | Always visible at bottom, keyboard-aware |
| **New conversation** | Available in Conversation Drawer, or long-press header title |

#### Conversation Sidebar

On tablet/desktop: a persistent sidebar listing all conversations. On phone: a bottom sheet triggered from the header.

- **Default sort**: Most recent first
- **Actions**: Create new, search, delete (swipe on phone, hover menu on desktop)
- **Selection**: Tap to switch active conversation (backend updates `activeConversation`)
- **Visual**: `GlassView intensity="medium"` background; active conversation highlighted
- **Future possibilities**: Folders, pinned conversations, drag-to-reorder, conversation search

#### Settings Sheet

A bottom sheet or side panel containing all configuration and utility features, grouped logically.

| Section | Contains |
|---------|----------|
| **Account** | User profile, server connection, sign out |
| **Secrets** | API keys and credentials (list → detail) |
| **Automations** | Triggers and Blueprints (grouped or separate) |
| **Tasks** | Task list for manual review (primary interaction is via chat) |
| **Appearance** | Theme toggle (light/dark/system) |

Opening Settings does not navigate away from chat — it overlays as a sheet. Dismissing returns to chat instantly.

#### Tasks

Tasks live in Settings alongside other utilities. The assistant is the primary interface for task management — users create, update, and complete tasks through conversation. The Settings list view exists for manual review and bulk operations, not as the primary interaction point.

#### Detail Screens

Detail screens (Secret Detail, Trigger Detail, Blueprint Detail, Task Detail) are pushed onto the navigation stack from their parent list. They use the **Inline Page** variant (glass header with back button).

- **Entry**: Tap item in Settings list
- **Exit**: Back button or swipe-back gesture
- **Context**: Header shows parent context (e.g., "Secrets › API Key")

### Responsive Behavior

| Breakpoint | Conversation Sidebar | Settings | Chat |
|------------|----------------------|----------|------|
| Phone (`$xs`) | Bottom sheet | Bottom sheet | Full screen |
| Tablet (`$sm`–`$md`) | Persistent sidebar (collapsible) | Side sheet (right) | Main area |
| Desktop (`$gtMd`) | Persistent sidebar | Side panel or modal | Main content area |

On tablet and desktop, the conversation list is a **persistent sidebar** on the left. This enables quick conversation switching, provides constant context, and opens up future possibilities (drag-and-drop organization, folders, pinned conversations). The sidebar can be collapsed to an icon rail on tablets if screen space is tight.

On phones, the sidebar becomes a bottom sheet to preserve vertical space for the chat.

### Transition Animations

| Transition | Animation |
|------------|-----------|
| Open Conversation Drawer | Slide in from left (tablet) or rise from bottom (phone) with chat dimming |
| Close Drawer | Reverse; chat un-dims |
| Open Settings Sheet | Rise from bottom with spring easing |
| Push to Detail | Standard stack push (slide from right) |
| Switch Conversation | Cross-fade message area; header title animates |

All transitions use `react-native-reanimated` with consistent spring configs (damping: 20, stiffness: 200).

### Deep Linking

URL structure for web and universal links:

| Route | Screen |
|-------|--------|
| `/` | Chat (active conversation from backend) |
| `/c/:id` | Chat with specific conversation (sets as active) |
| `/settings` | Settings sheet open over chat |
| `/settings/secrets` | Secrets list |
| `/settings/secrets/:id` | Secret detail |
| `/settings/triggers` | Triggers list |
| `/settings/triggers/:id` | Trigger detail |
| `/settings/blueprints` | Blueprints list |
| `/settings/blueprints/:id` | Blueprint detail |
| `/settings/tasks` | Tasks list |
| `/settings/tasks/:id` | Task detail |

---

## 1. Content First

The interface exists to serve the conversation. Chrome, controls, and decoration recede — the user's messages and the assistant's responses are the primary visual elements.

- Backgrounds are ambient aura gradients; content carries the color
- Controls appear when needed and stay out of the way otherwise
- Information density is moderate — compact but not cramped

## 2. Calm Confidence

The app feels dependable and unhurried. Status changes (streaming, loading, errors) are communicated clearly but without alarm. Transitions are smooth and purposeful.

- Use opacity and subtle color shifts over bold flashes for state changes
- Streaming indicator: three pulsing dots with subtle glow, not text — natural, not anxious
- Errors are surfaced as inline glass banners in context, not disruptive modals

## 3. Depth Through Glass & Aura

Surfaces are organized as frosted glass panels floating over ambient light. The aura layer provides soft color; glass surfaces provide structure and hierarchy.

- **Aura** (base layer): Soft gradient orbs positioned absolutely behind all content. Provides ambient color without competing with text.
- **Glass** (surface layer): Semi-transparent frosted panels with backdrop blur (iOS/Web) or opacity overlay (Android). Three intensity levels control visual weight.
- **Solid** (action layer): Primary action buttons (Connect, Approve, Send) remain solid `$accent` for clear affordance.

Depth hierarchy: Background Base → Aura Orbs → Glass Surfaces → Solid Actions

### Platform Strategy

| Platform | Blur | Fallback |
|----------|------|----------|
| iOS | `BlurView` (expo-blur) with native blur | — |
| Web | `BlurView` (expo-blur) with CSS backdrop-filter | — |
| Android | No native blur API | RGBA overlay only — still reads as glass via semi-transparency and border |

## 4. Purposeful Color

Color is used sparingly and intentionally. The base palette is neutral. Accent color flows through user message gradients and primary actions. Aura orbs provide ambient environmental color.

- **User messages**: Blue-to-purple `LinearGradient` with subtle glow shadow — signals identity
- **Accent (blue9)**: Primary action buttons, interactive links
- **Aura orbs**: Blue, purple, pink — ambient only, never competing with content
- **Semantic**: green (success), amber (warning), red (error) — used only for status
- **Neutral**: Gray scale for all chrome, text, borders, and assistant content
- Avoid decorative color; every colored element should communicate something

## 5. Native Typography

Typography uses the platform system font stack to feel native on every device. SF Pro on Apple platforms, Segoe UI on Windows, Roboto on Android. The type hierarchy is tight and precise — negative letter-spacing at larger sizes, compact line-heights.

| Role | Font | Weight | Size | Letter-spacing |
|---|---|---|---|---|
| Large title | Heading | 700 | 34px | -1.0 |
| Nav/section title | Heading | 600 | 17–20px | -0.2 to -0.3 |
| Body / chat text | Body | 400 | 16px | -0.1 |
| Secondary / caption | Body | 400 | 13px | 0 |
| UI label | Body | 500 | 13–14px | 0 |
| Code / data | Mono | 400 | 12–13px | 0 |

Key rules:
- System font families only — no web fonts (Inter, etc.)
- Line-height is tight: ~1.3x for body text, ~1.2x for headings
- Negative letter-spacing increases with font size (iOS convention)
- Medium weight (500) for UI labels; never more than two weights per screen

## 6. Consistent Spacing

All spacing derives from a base-4 scale. Components use the token scale (`$2`, `$3`, `$4`, etc.) rather than arbitrary pixel values. This creates visual rhythm across every screen.

| Token | Value | Usage |
|---|---|---|
| `$1` | 4px | Tight inner gaps (icon + label) |
| `$2` | 8px | Inner padding, compact gaps |
| `$3` | 12px | Standard component padding |
| `$4` | 16px | Section gaps, card padding |
| `$5` | 20px | Screen edge insets |
| `$6` | 24px | Major section separation |
| `$8` | 32px | Screen-level vertical rhythm |

- Horizontal screen insets: `$5` (20px) for page chrome, 16px for chat content
- Vertical gaps between sections: `$6` (24px)
- Inner component padding: 10–14px for chat bubbles, `$3`–`$4` for cards

## 7. Accessible by Default

The design must be usable by everyone. Contrast ratios, touch targets, and focus indicators are not afterthoughts.

- Text contrast meets WCAG AA (4.5:1 for body, 3:1 for large text) — verify against worst-case aura orb positions
- Touch targets are at least 44x44pt (send button, back button, tool card tap area)
- Interactive elements have visible focus states
- Color is never the only way to convey information (e.g. tool status has dot + text)
- Glass surfaces maintain sufficient contrast through `glassBackgroundIntense` on text-heavy areas (headers, input bars)

## 8. Responsive and Adaptive

The app runs on phones, tablets, and web. Layouts adapt using Tamagui media queries. The design works at every breakpoint — it's not a phone app stretched to fill a browser.

- `$xs` (< 660): single column, full-width cards
- `$sm`–`$md` (660–1020): comfortable single column, wider content area
- `$gtMd` (> 1020): sidebar + main content layout possible

---

## Glass & Aura System

### AuraBackground

Renders 2-3 soft gradient orbs (LinearGradient from expo-linear-gradient) positioned absolutely behind content. Orbs are large circles with radial fade-to-transparent.

| Variant | Description | Usage |
|---------|-------------|-------|
| `default` | Balanced 3-orb layout (blue top-left, purple center-right, pink bottom) | Conversation list, settings |
| `login` | Dramatic, centered orbs with higher opacity | Login screen |
| `chat` | Orbs at edges, calm center for readability | Chat screen |

### GlassView

Reusable frosted glass surface primitive. Wraps content with blur + semi-transparent overlay + 1px border.

| Intensity | Blur | Overlay Opacity | Usage |
|-----------|------|-----------------|-------|
| `subtle` | 20 | Low (0.25) | Tool cards, list items, inactive buttons |
| `medium` | 40 | Medium (0.45) | Login form, assistant bubbles |
| `strong` | 60 | High (0.65) | Header bars, input bars, approval banners |

Props: `intensity`, `children`, `borderRadius`, `padding`, `style`.

### Glass Tokens

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `glassBackground` | `rgba(255,255,255,0.45)` | `rgba(30,30,40,0.40)` | Default glass fill |
| `glassBackgroundIntense` | `rgba(255,255,255,0.65)` | `rgba(30,30,40,0.60)` | Input bar, headers |
| `glassBorder` | `rgba(255,255,255,0.25)` | `rgba(255,255,255,0.08)` | Glass panel border |
| `auraBlue` | `#4F6DF5` | `#4F6DF5` | Orb color |
| `auraPurple` | `#9B5DE5` | `#9B5DE5` | Orb color |
| `auraPink` | `#F15BB5` | `#F15BB5` | Orb color |
| `backgroundBase` | `#F0F0F5` | `#0A0A12` | Solid base under aura |

---

## Color System

### Semantic Tokens

These tokens are defined in the Tamagui theme and adapt between light and dark mode:

| Token | Light | Dark | Usage |
|---|---|---|---|
| `background` | `gray1` | `gray1` | Legacy — prefer `backgroundBase` |
| `backgroundBase` | `#F0F0F5` | `#0A0A12` | App background (solid base under aura) |
| `surface` | `white` | `gray2` | Content cards, inputs |
| `surfaceHover` | `gray2` | `gray3` | Input field backgrounds, hover states |
| `surfaceRaised` | `white` | `gray3` | Elevated cards, sheets |
| `color` | `gray12` | `gray12` | Primary text |
| `colorSubtle` | `gray11` | `gray11` | Secondary text, captions |
| `colorMuted` | `gray9` | `gray9` | Disabled text, placeholders |
| `borderSubtle` | `gray4` | `gray4` | Subtle dividers, borders |
| `accent` | `blue9` | `blue9` | Primary actions, user bubble |
| `accentSurface` | `blue3` | `blue3` | Tinted backgrounds |
| `success` | `green9` | `green9` | Connected, confirmed |
| `warning` | `yellow9` | `yellow9` | Caution states |
| `danger` | `red9` | `red9` | Errors, destructive actions |

### Chat Tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `chatUser` | `blue9` | `blue9` | User bubble gradient start (legacy) |
| `chatUserText` | `#ffffff` | `#ffffff` | User bubble text |
| `chatAssistant` | `#ffffff` | `gray3` | Legacy — assistant uses GlassView |
| `chatAssistantBorder` | `gray3` | `gray5` | Legacy — glass border replaces |
| `chatTool` | `gray2` | `gray2` | Legacy — tool cards use GlassView |
| `chatToolBorder` | `gray4` | `gray5` | Legacy — glass border replaces |

### Border Radii

| Token | Value | Usage |
|---|---|---|
| `$bubble` | 20px | Chat message bubbles |
| `$card` | 18px | Content cards |
| `$glass` | 24px | Glass panels |
| `$button` | 12px | Buttons |
| `$input` | 22px | Input fields (pill shape) |
| `$badge` | 8px | Badges, code blocks, bubble tail |
| `$full` | 9999px | Circles, pills |

---

## Component Patterns

### Page

The `Page` component provides screen-level chrome with two variants:

- **Large**: iOS-style large title (34px, -1 letter-spacing) on aura background. Used for top-level screens (Conversations, Settings).
- **Inline**: Compact nav bar (17px semibold) wrapped in `GlassView intensity="strong"` — frosted glass header. Used for detail screens.

Both variants render `AuraBackground` as the first child. Both support optional back button (`onBack`) and right action slot.

### Chat Bubbles

- **User**: Blue-to-purple `LinearGradient` with glow shadow, right-aligned, max 75% width. Bottom-right corner uses `$badge` radius (speech-tail effect).
- **Assistant**: `GlassView intensity="medium"`, left-aligned, max 88% width. Bottom-left corner uses `$badge` radius. Content rendered via MarkdownView.
- **Smart spacing**: 3px gap between consecutive same-sender messages, 12px between turns — creates visual grouping.

### Tool Call Cards

`GlassView intensity="subtle"` with 14px border radius. Status dot (green = completed, muted = pending). Mono font for function name. Tap anywhere to expand. Expanded view shows input/result in tinted code blocks.

### Approval Banner

`GlassView intensity="strong"` spanning full width above input. Small uppercase section label ("APPROVAL REQUIRED"), tool name in glass badge, description in body text. Primary action (Approve) is solid accent button; secondary (Reject) is ghost text.

### Input Bar

`GlassView intensity="strong"` at bottom of chat. Inner input field uses subtle glass tint (`rgba(255,255,255,0.15)`). Send button: solid `$accent` when active, `GlassView intensity="subtle"` circle when inactive.

### Buttons

- **Primary**: solid `$accent` background, white text, `$button` radius. Built with `Pressable` + styled views.
- **Ghost**: transparent, `$colorMuted` text — used for secondary actions like Reject.

### Inputs

Subtle glass tint (`rgba(255,255,255,0.15)`) background, no visible border, `$input` radius (pill shape). Uses RN `TextInput` inside a styled `XStack` shell. System font at 16px with -0.1 letter-spacing.

### Send Button

44x44pt circle. `$accent` background when text is entered, glass circle when empty. Arrow icon (`↑`) in white/muted.

### Streaming Indicator

Three 8px dots that pulse in sequence (one opaque with glow shadow, two faded). Positioned inline where the next assistant message would appear. No text.

### Connection Status

Glass pill (`GlassView intensity="subtle"`) with status dot and label text in the status color.

### Conversation List Items

Each item wrapped in `GlassView intensity="subtle"` with `$card` radius. Items have horizontal/vertical margins so cards float over the aura background.

---

## Implementation Notes

- **No Tamagui prebuilt components** for visual style — we use `YStack`, `XStack`, `Text`, `View` as a Tailwind-like styling system, and RN `Pressable`/`TextInput` for interaction. Tamagui's `Button`, `Input`, `Circle`, etc. are avoided because their internal theming overrides our design tokens.
- **System fonts only** — configured via `createFont()` in the Tamagui config. No web font downloads.
- **Glass components** use `expo-blur` (BlurView) on iOS/Web and RGBA overlay on Android.
- **Aura gradients** use `expo-linear-gradient` (LinearGradient) for soft radial orbs.
- **Storybook** is the living documentation for the design system. All components and full-screen compositions have stories. Theme toggle (light/dark) is available in the Storybook toolbar. The preview decorator renders components on `AuraBackground` for accurate visual context.

---

## Interaction Patterns

### Gestures

| Gesture | Context | Action |
|---------|---------|--------|
| Swipe right | Chat screen | Open Conversation Drawer |
| Swipe left | Conversation Drawer open | Close drawer |
| Swipe left on item | List item (conversations, tasks) | Reveal delete action |
| Long press | Message bubble | Copy text, share, or show menu |
| Long press | Header title | Rename conversation |
| Pull down | Chat (at top) | Refresh / load older messages |
| Pull down | Any list | Refresh data |

### Keyboard Shortcuts (Web/Desktop)

| Shortcut | Action |
|----------|--------|
| `⌘ K` / `Ctrl K` | Quick switcher (conversation search) |
| `⌘ N` / `Ctrl N` | New conversation |
| `⌘ ,` / `Ctrl ,` | Open Settings |
| `⌘ Enter` | Send message (when input focused) |
| `Escape` | Close drawer/sheet, or blur input |
| `↑` (in empty input) | Edit last sent message |

### Empty States

Every list should have a purposeful empty state that guides the user:

| Screen | Empty State |
|--------|-------------|
| Conversation list | "No conversations yet. Start chatting!" with prominent new-chat button |
| Tasks | "All clear! Add a task to get started." with add button |
| Secrets | "No secrets configured. Add API keys to connect services." |
| Triggers | "No automations running. Create a trigger to automate tasks." |
| Blueprints | "No blueprints yet. Blueprints help the assistant follow your processes." |

Empty states use `GlassView intensity="subtle"` as a container, with muted text and a single clear action.

### Loading States

- **Initial load**: Skeleton placeholders matching content shape (glass rectangles with shimmer)
- **Refresh**: Pull-to-refresh indicator (native on mobile, subtle spinner on web)
- **Streaming**: Three-dot pulse indicator inline with messages
- **Action pending**: Button shows spinner, remains tappable area disabled

### Error Handling

Errors appear as inline glass banners, not blocking modals:

- **Network error**: Banner at top of chat with retry action
- **Tool failure**: Inline in message stream, collapsible details
- **Validation error**: Inline below input field, red text on glass

### Confirmations

Destructive actions (delete conversation, remove trigger) use a confirmation sheet:

- Title: "Delete [item]?"
- Description: Brief consequence explanation
- Actions: "Cancel" (ghost) | "Delete" (solid danger)
- Sheet uses `GlassView intensity="strong"`

Avoid confirmation for reversible actions (marking task complete, renaming).

---

## Migration Path

The current app structure uses flat navigation with utility icons in the header. To migrate to the chat-first architecture:

### Phase 1: Chat as Home
1. Change app entry point to fetch and display the backend's active conversation
2. Create conversation sidebar component (persistent on tablet/desktop, sheet on phone)
3. Wire up conversation selection to update backend's `activeConversation`

### Phase 2: Settings Consolidation
1. Create Settings sheet component
2. Move utilities (Secrets, Triggers, Blueprints, Tasks) under Settings
3. Remove utility icons from chat header; add single Settings gear

### Phase 3: Responsive Layout
1. Implement persistent sidebar for `$sm` and above breakpoints
2. Add collapsible sidebar toggle for tablets
3. Polish transitions and gestures

### File Changes Required

| Current | New |
|---------|-----|
| `app/index.tsx` (conversation list) | `app/index.tsx` (chat with active conversation + sidebar) |
| `app/conversation/[id].tsx` | Kept for deep links; sets conversation as active then redirects to `/` |
| `app/secrets.tsx`, `app/triggers.tsx`, `app/blueprints.tsx`, `app/todos.tsx` | Move under `app/settings/` group |
| — | New: `src/components/conversation-sidebar/` |
| — | New: `src/components/settings-sheet/` |

---

## File Reference

- Theme config: `apps/expo/src/theme/tamagui.config.ts`
- Glass component: `apps/expo/src/components/glass/glass-view.tsx`
- Aura component: `apps/expo/src/components/aura/aura-background.tsx`
- Components: `apps/expo/src/components/`
- Storybook: `pnpm --filter @morten-olsen/agentic-expo storybook`

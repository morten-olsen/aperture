# Design Principles

Design language for the GLaDOS client app. These principles guide every component, screen, and interaction.

## 1. Content First

The interface exists to serve the conversation. Chrome, controls, and decoration recede — the user's messages and the assistant's responses are the primary visual elements.

- Backgrounds are neutral and muted; content carries the color
- Controls appear when needed and stay out of the way otherwise
- Information density is moderate — compact but not cramped

## 2. Calm Confidence

The app feels dependable and unhurried. Status changes (streaming, loading, errors) are communicated clearly but without alarm. Transitions are smooth and purposeful.

- Use opacity and subtle color shifts over bold flashes for state changes
- Streaming indicator: three pulsing dots, not text — natural, not anxious
- Errors are surfaced as inline banners in context, not disruptive modals

## 3. Depth Through Layering

Surfaces are organized into distinct layers. Each layer has a clear role — background, content surface, elevated elements (cards, sheets), and overlays.

- Background → Surface → Elevated → Overlay (four depth levels)
- Chat bubbles are raised surfaces — white with a subtle 1px border (light mode) or tinted gray (dark mode)
- In dark mode, lighter surfaces are "closer"; in light mode, white surfaces are "closer"

## 4. Purposeful Color

Color is used sparingly and intentionally. The base palette is neutral gray. Accent color (blue) is reserved for the user's own messages and primary actions — it signals identity and intent.

- **Accent (blue9)**: user chat bubble (solid, with white text), primary action buttons, interactive links
- **Semantic**: green (success), amber (warning), red (error) — used only for status
- **Neutral**: gray scale for all chrome, text, borders, and assistant content
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

- Text contrast meets WCAG AA (4.5:1 for body, 3:1 for large text)
- Touch targets are at least 44x44pt (send button, back button, tool card tap area)
- Interactive elements have visible focus states
- Color is never the only way to convey information (e.g. tool status has dot + text)

## 8. Responsive and Adaptive

The app runs on phones, tablets, and web. Layouts adapt using Tamagui media queries. The design works at every breakpoint — it's not a phone app stretched to fill a browser.

- `$xs` (< 660): single column, full-width cards
- `$sm`–`$md` (660–1020): comfortable single column, wider content area
- `$gtMd` (> 1020): sidebar + main content layout possible

---

## Color System

### Semantic Tokens

These tokens are defined in the Tamagui theme and adapt between light and dark mode:

| Token | Light | Dark | Usage |
|---|---|---|---|
| `background` | `gray1` | `gray1` | App background |
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
| `chatUser` | `blue9` | `blue9` | User bubble background (solid accent) |
| `chatUserText` | `#ffffff` | `#ffffff` | User bubble text (white on accent) |
| `chatAssistant` | `#ffffff` | `gray3` | Assistant bubble background |
| `chatAssistantBorder` | `gray3` | `gray5` | Assistant bubble border |
| `chatTool` | `gray2` | `gray2` | Tool call card background |
| `chatToolBorder` | `gray4` | `gray5` | Tool call card border |

### Border Radii

| Token | Value | Usage |
|---|---|---|
| `$bubble` | 20px | Chat message bubbles |
| `$card` | 18px | Content cards |
| `$button` | 12px | Buttons |
| `$input` | 22px | Input fields (pill shape) |
| `$badge` | 8px | Badges, code blocks, bubble tail |
| `$full` | 9999px | Circles, pills |

---

## Component Patterns

### Page

The `Page` component provides screen-level chrome with two variants:

- **Large**: iOS-style large title (34px, -1 letter-spacing). Used for top-level screens (Conversations, Settings).
- **Inline**: Compact nav bar (17px semibold). Used for detail screens (Conversation, pushed screens).

Both variants support optional back button (`onBack`) and right action slot.

### Chat Bubbles

- **User**: solid `$chatUser` (blue9) background, white text, right-aligned, max 75% width. Bottom-right corner uses `$badge` radius (speech-tail effect).
- **Assistant**: white bubble with 1px `$chatAssistantBorder`, left-aligned, max 88% width. Bottom-left corner uses `$badge` radius.
- **Smart spacing**: 3px gap between consecutive same-sender messages, 12px between turns — creates visual grouping.

### Tool Call Cards

Compact, collapsible inline cards. Border-only style with `$chatToolBorder`. Status dot (green = completed, muted = pending). Mono font for function name. Tap anywhere to expand. Expanded view shows input/result in code blocks.

### Approval Banner

Appears above the input bar when tool approval is needed. Small uppercase section label ("APPROVAL REQUIRED"), tool name in a code badge, description in body text. Primary action (Approve) is solid accent button; secondary (Reject) is ghost text.

### Buttons

- **Primary**: solid `$accent` background, white text, `$button` radius. Built with `Pressable` + styled views (not Tamagui `<Button>`).
- **Ghost**: transparent, `$colorMuted` text — used for secondary actions like Reject.

### Inputs

`$surfaceHover` background, no visible border, `$input` radius (pill shape). Uses RN `TextInput` inside a styled `XStack` shell for full control. System font at 16px with -0.1 letter-spacing.

### Send Button

44x44pt circle. `$accent` background when text is entered, `$surfaceHover` when empty. Arrow icon (`↑`) in white/muted.

### Streaming Indicator

Three 8px dots that pulse in sequence (one opaque, two faded). Positioned inline where the next assistant message would appear. No text.

### Connection Status

Pill-shaped badge with tinted background (`$successSurface` / `$dangerSurface`), status dot, and label text in the status color.

---

## Implementation Notes

- **No Tamagui prebuilt components** for visual style — we use `YStack`, `XStack`, `Text`, `View` as a Tailwind-like styling system, and RN `Pressable`/`TextInput` for interaction. Tamagui's `Button`, `Input`, `Circle`, etc. are avoided because their internal theming overrides our design tokens.
- **System fonts only** — configured via `createFont()` in the Tamagui config. No web font downloads.
- **Storybook** is the living documentation for the design system. All components and full-screen compositions have stories. Theme toggle (light/dark) is available in the Storybook toolbar.

---

## File Reference

- Theme config: `apps/expo/src/theme/tamagui.config.ts`
- Components: `apps/expo/src/components/`
- Storybook: `pnpm --filter @morten-olsen/agentic-expo storybook`

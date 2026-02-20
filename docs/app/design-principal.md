# Design Principles

Design language for the GLaDOS client app. These principles guide every component, screen, and interaction.

## 1. Content First

The interface exists to serve the conversation. Chrome, controls, and decoration recede — the user's messages and the assistant's responses are the primary visual elements. Generous whitespace gives content room to breathe.

- Backgrounds are neutral and muted; content carries the color
- Controls appear when needed and stay out of the way otherwise
- Information density is moderate — not cramped, not wasteful

## 2. Calm Confidence

The app feels dependable and unhurried. Status changes (streaming, loading, errors) are communicated clearly but without alarm. Transitions are smooth and purposeful.

- Use opacity and subtle color shifts over bold flashes for state changes
- Streaming and loading states feel natural, not anxious
- Errors are surfaced clearly in context, not as disruptive modals

## 3. Depth Through Layering

Surfaces are organized into distinct layers. Each layer has a clear role — background, content surface, elevated elements (cards, sheets), and overlays. Layering creates hierarchy without relying on heavy borders.

- Background → Surface → Elevated → Overlay (four depth levels)
- Subtle background tint differences distinguish layers (not borders or shadows)
- In dark mode, lighter surfaces are "closer"; in light mode, white surfaces are "closer"

## 4. Purposeful Color

Color is used sparingly and intentionally. The base palette is neutral gray. Accent color draws attention to primary actions and the user's own messages. Semantic colors (success, warning, error) appear only when communicating status.

- **Accent**: a single brand hue for primary actions and user identity
- **Semantic**: green (success), amber (warning), red (error) — used only for status
- **Neutral**: gray scale for all chrome, text, borders, and assistant content
- Avoid decorative color; every colored element should communicate something

## 5. Typography as Structure

Type hierarchy creates visual order. Three levels handle nearly every case: titles, body, and captions. Monospace is reserved for code and technical data (tool calls, JSON).

| Role | Font | Weight | Size Token |
|---|---|---|---|
| Screen title | Heading | 700 | `$8` |
| Section header | Heading | 600 | `$6` |
| Body text | Body | 400 | `$4` |
| Secondary/caption | Body | 400 | `$3` |
| Code / data | Mono | 400 | `$3` |

- Line height is comfortable (1.5x for body, 1.3x for headings)
- Letter spacing is default for body, slightly tighter for large headings
- Never use more than two weights on a single screen

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

- Horizontal screen insets: `$5` (20px)
- Vertical gaps between sections: `$6` (24px)
- Inner component padding: `$3`–`$4`

## 7. Accessible by Default

The design must be usable by everyone. Contrast ratios, touch targets, and focus indicators are not afterthoughts.

- Text contrast meets WCAG AA (4.5:1 for body, 3:1 for large text)
- Touch targets are at least 44x44pt
- Interactive elements have visible focus states
- Color is never the only way to convey information

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
| `surfaceRaised` | `white` | `gray3` | Elevated cards, sheets |
| `color` | `gray12` | `gray12` | Primary text |
| `colorSubtle` | `gray10` | `gray10` | Secondary text, captions |
| `colorMuted` | `gray8` | `gray8` | Disabled text, placeholders |
| `borderColor` | `gray4` | `gray4` | Default borders |
| `borderSubtle` | `gray3` | `gray3` | Subtle dividers |
| `accent` | `blue9` | `blue9` | Primary actions, user bubble |
| `accentSurface` | `blue3` | `blue3` | Tinted backgrounds |
| `success` | `green9` | `green9` | Connected, confirmed |
| `warning` | `yellow9` | `yellow9` | Caution states |
| `danger` | `red9` | `red9` | Errors, destructive actions |

### Chat Bubbles

- **User**: accent-tinted background (`accentSurface`), aligned right
- **Assistant**: neutral surface (`surface`), aligned left, full width
- **Tool calls**: muted surface with left border accent, collapsible
- **System/error**: danger-tinted background, inline

---

## Component Patterns

### Cards

Cards use `surface` background, `$4` padding, `$4` border radius, no border by default. Raised cards (sheets, overlays) use `surfaceRaised` background.

### Buttons

- **Primary**: `accent` background, white text, `$4` border radius
- **Secondary**: transparent background, `accent` text, `$4` border radius, border
- **Ghost**: transparent background, `color` text, no border — used for inline actions

### Inputs

`surface` background, `borderColor` border, `$4` padding, `$4` border radius. Focus state: `accent` border.

### Lists

No borders between items. Use spacing (`$3` gap) to separate list items. Pull-to-refresh uses native behavior.

---

## File Reference

- Theme config: `apps/expo/src/theme/tamagui.config.ts`
- Components: `apps/expo/src/components/`
- Storybook: `pnpm --filter @morten-olsen/agentic-expo storybook`

# OrderCue extension design system

> Status: Active
> Canonical source: `apps/extension/DESIGN.md`
> Last decision review: 2026-08-27

This document is the binding UI contract for the extension, its settings page, and the browser-safe demo.

## Source of truth

- Canonical application: `apps/extension`
- Theme and global rules: `src/entrypoints/sidepanel/index.css`
- Shared UI layer: `src/components/ui`
- Component registry configuration: `components.json`
- Feature composition: `src/components`, `src/options`, and `src/entrypoints`
- Host-page adapters: `src/content`

`src/components/ui` contains components installed from the official shadcn registry. Product components compose these primitives; they do not define a parallel primitive library.

## Product and information architecture

OrderCue is a compact, local-first work queue for Amazon orders. The primary workflow is one vertically scrolling side panel: search or filter, inspect an order, change its status or note, then export or delete deliberately. Settings is a separate full-page form for Marketplace defaults. The Vercel demo renders the real side-panel workflow with browser-local sample data.

The complete workflow must remain usable from 320px to 480px. At narrow widths, controls wrap or scroll horizontally; actions may not disappear into hover-only affordances.

## Visual language

- Direction: restrained Vercel/Geist application chrome.
- Fonts: Geist Sans for interface copy; Geist Mono for order identifiers, prices, and compact technical labels.
- Type scale: `micro` 10/14 for order metadata and terse technical copy; `caption` 12/16 for secondary copy and compact controls; `body` 14/20 for normal interface copy; `title` 16/20 for product and dialog titles; `heading` 20/28 for page and empty-state headings.
- Typography ownership: these five named roles are the complete live scale. Feature code and shared primitives must use the named roles rather than Tailwind's numeric size aliases or arbitrary pixel sizes.
- Core palette: near-white canvas `#fafafa`, white elevated surfaces, near-black ink `#171717`, and the documented grey ladder.
- Interaction color: blue is reserved for links and focus. Semantic status color is limited to the status icon or destructive state.
- Radius: compact controls use 4–6px, cards use 8px, and pills are limited to badges and counters.
- Elevation: borders first. Shadows are limited to floating shadcn overlays and a minimal card shadow where needed.
- Motion: controls respond in roughly 150ms; side-panel sections and list rows enter over 260–520ms with restrained stagger; shadcn/Radix owns overlay motion. Every transform and continuous animation must respect reduced-motion preferences.

## Ownership

- The application stylesheet owns tokens, fonts, base rules, and scrollbar behavior.
- `components/ui` owns reusable controls, overlays, focus behavior, and shared visual states.
- Feature components own business data, event handlers, layout composition, and copy.
- Entry points own providers and orchestration, not primitive styling.
- Host-page adapters may use direct DOM controls only when rendering inside Amazon or Facebook pages where the extension stylesheet and React primitive tree are unavailable.

## Canonical components

| Role | Component |
| --- | --- |
| Actions | `Button` |
| Text entry | `Input`, `Textarea` |
| Choice | `Checkbox`, `Select`, `Slider` |
| Floating actions | `DropdownMenu` |
| Destructive confirmation | `AlertDialog` |
| Editable modal | `Dialog` |
| Status messaging | `Alert`, `Badge` |
| Surfaces and loading | `Card`, `Skeleton` |
| Accessible labels | `Label` |

Feature React code must not render raw `button`, `input`, `select`, `textarea`, or `dialog` elements when a canonical primitive exists.

## Workflow states

- Loading uses `Skeleton` and preserves the final list rhythm.
- Empty collection explains how to save the first order; the demo may restore sample data.
- Empty search keeps filters visible and offers a clear-search action.
- Local-only and demo state use `Alert`; destructive failures use its destructive variant.
- Selection remains visible through `Checkbox`, card border, and focus ring.
- Clicking a card's non-interactive surface toggles selection. Opening Amazon remains an explicit external-link action so navigation never competes with selection.
- Deletion always uses `AlertDialog`; focus trapping, Escape handling, and focus return belong to Radix.
- Disabled extension-only actions remain visible in the demo with an accessible explanation.

## Accessibility

- Every icon-only action requires an accessible name.
- Focus-visible behavior comes from the shared shadcn primitive.
- Each order card exposes one keyboard selection stop: Enter or Space toggles selection and the visual checkbox mirrors that state without adding a duplicate Tab stop.
- Status must never be communicated by color alone.
- Dialog and menu keyboard behavior must remain delegated to Radix.
- The minimum interactive target is 32px in the compact side panel; normal controls are 36px or larger.

## Enforcement

- `bun run lint` uses Biome to enforce UI import boundaries.
- `bun run check:design` verifies product-specific tokens and controls; CI and `just check` run both.
- The guard verifies the canonical registry/configuration, required shadcn primitives, and the absence of raw controls in feature React code.
- The guard rejects unregistered typography sizes across feature code, entry points, settings, and shared UI.
- React feature code, including content-script modals and demos, uses `components/ui`. Only DOM injection into host-owned markup is exempt.
- Marketplace preview uses the shared shadcn `Dialog` inside WXT's iframe UI so host styles cannot override controls. The host adapter owns mounting and returning focus to its Amazon trigger; Radix owns focus and keyboard behavior inside the frame.
- Business components import shared UI; Radix imports belong in `components/ui`.
- Status selection, filtering, and exports read labels from `ORDER_STATUS_LABELS`.

## Decisions log

| Date | Decision | Reason | Supersedes |
| --- | --- | --- | --- |
| 2026-08-27 | Geist/Vercel monochrome is the canonical visual direction. | Matches the browser demo and compact operational workflow. | Warm paper/green exploration. |
| 2026-08-27 | Official shadcn components backed by unified `radix-ui` own all React controls and overlays. | Avoids hand-built interaction behavior and keeps accessibility in established primitives. | Feature-local buttons, inputs, selects, menus, and modal. |
| 2026-08-27 | Five semantic type roles (10, 12, 14, 16, and 20px) are the complete extension scale. | Removes one-off 9, 11, 13, 18, and 24px choices while preserving compact metadata and readable body copy. | Ad hoc Tailwind and arbitrary font sizes. |

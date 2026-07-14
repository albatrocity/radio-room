# 0070. Route Transitions via View Transitions API

**Date:** 2026-07-13
**Status:** Accepted

## Context

The lobby-to-room join should feel continuous: the hero logo zooms into its aperture while the room is revealed underneath, not after a black gap or a second “approach” animation. anime.js is this app’s default animation library for in-page effects, but it cannot target View Transition pseudo-elements (`::view-transition-old/new/group(...)`), which are not real DOM nodes.

Alternatives considered:

- **Root-level overlay + anime.js** — animate a cloned logo over an opaque scrim while navigating; full control, but bespoke and diverges from TanStack Router’s route-transition conventions.
- **Framer Motion + AnimatePresence** — not used elsewhere in the repo; exit animations fight TanStack’s immediate `Outlet` unmount.
- **View Transitions API (chosen)** — TanStack Router (`@tanstack/react-router@^1.169`) wraps opted-in navigations in `document.startViewTransition()`. CSS on `::view-transition-*` drives the logo zoom and room reveal; unsupported browsers degrade to plain navigation.

## Decision

1. **Opt-in per navigation.** Lobby join uses `navigate({ ..., viewTransition: animationsEnabled })`. Do not enable `defaultViewTransition` globally so other routes stay instant unless they opt in.
2. **CSS-driven hole zoom.** Mark the lobby hero logo with `view-transition-name: room-logo` (via `.room-hero-logo`). Animate `::view-transition-old(room-logo)` to scale from the hole origin and dissolve; fade `::view-transition-old(root)` out and `::view-transition-new(root)` in. Styles live in `apps/web/src/styles/roomTransition.css`, imported from `apps/web/src/main.tsx`.
3. **Warm room data on click.** Call `initializeRoom(roomId)` before navigating so socket/fetch/auth run during the ~700ms transition window (`initializeRoom` is idempotent for the subsequent room-route mount).
4. **anime.js elsewhere.** Keep anime.js for in-page UI animations. Do not use anime.js to drive View Transition pseudo-elements (including custom-property hacks against the VT lifecycle).
5. **Reduced motion.** Gate VT with `useAnimationsEnabled()` and keep CSS behind `@media (prefers-reduced-motion: no-preference)`.

## Consequences

- Join transitions follow TanStack’s documented View Transitions pattern and reveal the room as the living `new` snapshot under the zooming logo.
- Tuning the zoom requires editing CSS keyframes (not anime.js timelines).
- Firefox and browsers without `startViewTransition` get an instant route change; TanStack falls back automatically.
- The `new(root)` snapshot can briefly show an empty room if data is slow; click-time `initializeRoom` mitigates this for typical loads.

## See also

- [TanStack Router view-transitions example](https://github.com/tanstack/router/tree/main/examples/react/view-transitions)
- `apps/web/src/styles/roomTransition.css`
- `apps/web/src/components/Lobby/Lobby.tsx`
- `apps/web/src/actors/roomLifecycle.ts`

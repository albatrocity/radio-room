# 0124. Browser chrome follows `primary.solid`

**Date:** 2026-08-27
**Status:** Accepted

## Context

[ADR 0121](0121-installable-web-app-no-service-worker.md) ships a static `theme-color`. [ADR 0123](0123-launch-placeholder-without-service-worker.md) sets that value to splash teal `#0093A5` so the first paint matches the logo canvas. After React mounts, the room header uses `primary.solid` (the selected app theme). The status bar / browser chrome stayed teal.

Installed iOS uses `apple-mobile-web-app-status-bar-style: black-translucent` and `viewport-fit=cover`. The status bar is transparent; `.app-shell` pads `--safe-area-top`, so the header does not draw under the notch. Whatever fills that pad (or `theme-color`, depending on the engine) is the chrome the user sees.

## Decision

1. **Keep splash teal in `index.html` / the manifest.** First paint and Android’s generated splash stay `#0093A5`.
2. **After mount, `theme-color` tracks `primary.solid`.** Read `--chakra-colors-primary-solid` and replace the `<meta name="theme-color">` node (Safari often ignores in-place `content` updates). Re-run when the selected theme, color mode, or dynamic palette changes.
3. **Paint the shell’s top inset with the same token.** `.app-shell` uses a `primary.solid` background strip of height `--safe-area-top` so translucent standalone chrome matches the Now Playing header without moving layout padding.

## Consequences

- Status bar / browser chrome matches the fuchsia (or whatever) header after load, and updates when the listener picks another theme.
- Splash and live chrome can disagree for a few hundred milliseconds; that is the same window as the logo placeholder.
- A new header background token would need this mapping updated.

## See also

- [0121](0121-installable-web-app-no-service-worker.md) — installable chrome, static `theme-color` at ship time
- [0122](0122-overlay-safe-area-via-chakra-recipes.md) — overlay safe-area; this decision does not change dialog/drawer padding
- [0123](0123-launch-placeholder-without-service-worker.md) — splash teal first paint

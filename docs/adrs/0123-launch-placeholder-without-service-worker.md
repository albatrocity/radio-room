# 0123. Launch placeholder without a service worker

**Date:** 2026-08-27
**Status:** Accepted

## Context

Installed home-screen launches ([ADR 0121](0121-installable-web-app-no-service-worker.md)) show a blank white screen for a few seconds. CSS lives in the JS module graph, so `index.html` paints an empty `#root` on a default-white canvas until the bundle downloads. iOS standalone mode also ignores the Web App Manifest splash (`background_color` + icons) and requires `apple-touch-startup-image` bitmaps whose pixel size matches the device exactly; a miss is a white native splash.

A service worker that precaches the shell would hide the wait on repeat launches, and would also serve stale HTML after deploys. [ADR 0121](0121-installable-web-app-no-service-worker.md) forbids registering one.

## Decision

1. **Inline first paint in `index.html`.** Critical CSS paints a centered logo (`#app-splash`, same path geometry as the favicon / `Logo` component) on teal `#0093A5` with yellow `#FEB216` and black fills from the brand mark. The teal `html`/`body` fill is gated on `data-launch-splash` so unlayered splash CSS cannot override Chakra theme backgrounds after mount. The splash is a sibling of `#root`, not a child, so React can mount without the `innerHTML` guard treating markup as a pre-rendered tree.
2. **Dismiss after the first commit.** `dismissLaunchSplash()` runs from the root route `useLayoutEffect`: it removes `#app-splash` and `data-launch-splash` so the placeholder is gone before the browser paints React, with no fade and no extra request.
3. **iOS native splash.** Generate teal + centered-logo PNGs and `<link rel="apple-touch-startup-image">` tags from [`apps/web/scripts/generateAppleSplash.mjs`](../../apps/web/scripts/generateAppleSplash.mjs). Android Chrome already composes a splash from the manifest `background_color` and icons.
4. **Still no service worker.** Do not register one to make this wait shorter.

## Consequences

- Cold start of an installed app shows the logo on teal instead of white, then the live UI, without caching `index.html`.
- iOS caches startup images at Add to Home Screen time. Existing icons may keep a white native splash until the user re-adds the app; the inline HTML splash still covers the JS-download gap.
- New device viewports need a row in the generator and a regenerate, or that device shows a white native splash again.

## See also

- [0121](0121-installable-web-app-no-service-worker.md) — installable chrome, no service worker
- [0124](0124-browser-chrome-follows-primary-solid.md) — live `theme-color` after splash

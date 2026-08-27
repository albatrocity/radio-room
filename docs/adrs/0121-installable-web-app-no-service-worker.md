# 0121. Installable web app without a service worker

**Date:** 2026-08-27
**Status:** Accepted

## Context

Mobile listeners use the web client in Safari/Chrome tabs. The room already recovers from backgrounding ([ADR 0031](0031-staleness-aware-refresh-on-visibility.md), [ADR 0038](0038-socket-io-client-never-give-up-reconnection.md)), but the shell still looks like a website: no Add to Home Screen metadata, no standalone display, no theme-color.

A service worker that caches the SPA shell would make repeat visits feel faster, and would also serve stale `index.html` after deploys. This product is a live Socket.IO room plus a stream; offline is not useful.

Guest identity is origin-scoped `localStorage` ([ADR 0058](0058-client-session-localstorage.md)). Installed PWAs on some iOS versions historically isolated storage from Safari.

## Decision

1. **Installable chrome, no service worker.** Ship a Web App Manifest (`display: standalone`), Apple web-app meta, `theme-color`, and icons. Do not register a service worker in this decision.
2. **Icons.** Raster home-screen / maskable icons are generated from [`infra/cdn/assets/logo.png`](../../infra/cdn/assets/logo.png) (black square canvas). The tab favicon SVG uses the same path geometry as the in-app `Logo` ([`apps/web/src/components/ui/logo.tsx`](../../apps/web/src/components/ui/logo.tsx) / archive `Logo.svelte`).
3. **No Workbox / `vite-plugin-pwa`** until a follow-up ADR specifies network-first HTML, cache-only hashed `/assets`, and no Socket.IO interception.
4. **Identity.** Keep `clientSession` as the source of guest id. Do not promise that a home-screen icon and a Safari tab are the same person on every iOS version.

## Consequences

- Users can Add to Home Screen / Install and get standalone chrome with safe-area insets handled in the layout. Portaled dialogs and drawers inherit the same inset via slot recipes ([ADR 0122](0122-overlay-safe-area-via-chakra-recipes.md)).
- First paint is unchanged by this ADR (no SW). Repeat visits still rely on Netlify hashed-asset cache headers.
- A later SW would need its own ADR; this one forbids registering one in the web app until then.

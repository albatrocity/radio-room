# 0125. Padded teal PWA icons

**Date:** 2026-08-28
**Status:** Accepted

## Context

[ADR 0121](0121-installable-web-app-no-service-worker.md) generated home-screen icons from [`infra/cdn/assets/logo.png`](../../infra/cdn/assets/logo.png) on a black square, edge to edge. iOS rounded-rect and Android maskable crops clip the mark. The launch placeholder ([ADR 0123](0123-launch-placeholder-without-service-worker.md)) already uses teal `#0093A5` with the yellow/black mark.

## Decision

1. **Partially supersede [0121](0121-installable-web-app-no-service-worker.md) Icons.** Raster home-screen icons come from the favicon SVG geometry (same paths as `Logo`), not `logo.png`. Canvas is brand teal `#0093A5`.
2. **Inset the mark.** `any` / Apple-touch icons scale the mark to 66% of the canvas. Maskable icons use 56% so the mark stays inside the 80% safe circle.
3. **Generate with [`apps/web/scripts/generatePwaIcons.mjs`](../../apps/web/scripts/generatePwaIcons.mjs)** (`npm run generate:icons -w web`).

The tab favicon SVG may stay tighter than the home-screen PNGs; it is 16–32 CSS px in a browser tab.

## Consequences

- Home-screen icons match the splash colorway and survive OS masks.
- `logo.png` on the CDN is no longer the PWA icon source; newsletter and other CDN uses are unchanged.
- Existing installed icons update only after the user removes and re-adds the app on some iOS versions.

## See also

- [0121](0121-installable-web-app-no-service-worker.md) — installable chrome; icon source superseded here
- [0123](0123-launch-placeholder-without-service-worker.md) — splash teal + mark

# 0122. Overlay safe-area via Chakra slot recipes

**Date:** 2026-08-27
**Status:** Accepted

## Context

Installed iOS PWAs ([ADR 0121](0121-installable-web-app-no-service-worker.md)) use `viewport-fit=cover`. The room layout pads with `--safe-area-*`, but Chakra `Dialog` / `Drawer` positioners portal to `document.body` and skip that padding. Close controls sit under the status bar / home indicator unless every overlay opts in.

Per-call-site `css={overlayPositionerSafeCss}` does not scale: a new `Dialog.Root` is easy to ship without the inset.

`size="full"` dialog content is `minH: 100dvh` and centered, so padding the positioner alone makes the card overflow back under the notch.

## Decision

1. **Theme, not call sites.** Extend Chakra’s `dialog` and `drawer` slot recipes in [`apps/web/src/theme/`](../../apps/web/src/theme/chakraTheme.ts). `createSystem` deep-merges these onto the defaults, so every overlay inherits standalone safe-area inset and a 44px close target.
2. **Dialogs.** Pad `positioner` with `--safe-area-*`. Keep close `position: absolute` (it is relative to the already-inset card). Override `size.full` so content stretches into the padded box (`alignItems: stretch!`, `height: 100%`, not `100dvh`).
3. **Drawers / bottom sheets.** Do not pad the positioner on the flush edge — that shrinks the sheet and shows a strip of backdrop above the home indicator. Put `--safe-area-*` on `content` so the panel background is edge-to-edge and list/footer content stays above the indicator. Cap content at `maxH: 100%` instead of `100dvh`.
4. **In-flow exceptions.** `Dialog.Root` used without a `Positioner` (e.g. admin settings inside the integrated panel) is already inside layout padding; recipe positioner styles do not apply. Do not add a second inset there.
5. **Do not** copy safe-area CSS onto each new `DialogPositioner`. New overlays just use Chakra `Dialog` / `Drawer`. Use `size="full"` or `size="cover"` when the card should fill the padded viewport.

## Consequences

- Future dialogs and drawers get notch-safe chrome without a shared helper import.
- Recipe merge is order-sensitive for shorthand `padding` vs longhands; `size.cover` and `contained` drawers set padding with `calc(var(--safe-area-*) + …)` so they do not clobber the inset.
- Call-site `css` on `DialogPositioner` can still override the recipe when a one-off layout needs it.

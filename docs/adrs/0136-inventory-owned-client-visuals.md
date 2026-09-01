# 0136. Inventory-Owned Client Visuals

**Date:** 2026-08-31
**Status:** Accepted

## Context

Some inventory items should change the room UI while held (e.g. an Oscilloscope that paints a CRT-style waveform behind Now Playing). Plugins cannot ship React ([ADR 0006](0006-plugin-system-for-room-features.md)). Modifier flags ([ADR 0046](0046-derived-modifier-flags.md)) model timed post-use effects, not durable ownership. Plugin `showWhen` is room-scoped, not per-user ([ADR 0049](0049-item-shops-and-shopping-sessions.md)). Selling, gifting, and trading already remove inventory stacks via core (`InventoryService.removeItem` → `USER_GAME_STATE`).

Radio stream analysis needs a browser `AnalyserNode` on the listen element. Cross-origin Icecast/Shoutcast streams require CORS headers for Web Audio taps; without them the tap is silent while playback still works.

## Decision

1. **Ownership lives in Item Shops; visuals live in `apps/web`.** Catalog SKUs may be inert on the server (no `use` handler). The client keys off a fully-qualified `definitionId` (e.g. `item-shops:oscilloscope`) in `USER_GAME_STATE.inventory`.
2. **Lazy-load visual assets only when owned.** Mount paths use `React.lazy` / dynamic `import()` so non-owners never download the canvas/analyser chunk.
3. **Room-type shop SKUs.** `ItemCatalogEntry` may declare `availableInRoomTypes?: Room["type"][]`. When assigning shopping offers, strip SKUs whose list does not include `room.type`. Gift/trade into other room types remains allowed; the item is inert there.
4. **Radio audio tap.** Radio listen uses the Web Audio stream player in [ADR 0137](0137-radio-stream-player-web-audio.md) (one fetch → decode → gain + analyser). Live/hybrid may still register an `HTMLAudioElement` and use `captureStream` / MES on Chromium. Do not call `howler.stop()` on radio pause (radio no longer uses Howler).
5. **CORS is the stream operator’s responsibility.** Do not proxy the listen URL through the API for analyser access. Without CORS, the Web Audio radio player cannot fetch; the station must send CORS headers.
6. **Reduce motion.** Prefer `useAnimationsEnabled()`: when false, cap the visual at **1 frame per second** rather than disabling it.

## Consequences

- New ownership-driven FX follow the Oscilloscope pattern without expanding the plugin component schema.
- Shop catalogs can hide radio-only SKUs from jukebox/live offers without new shops.
- Trade-off: client must hard-code `definitionId` constants for each visual item.
- Trade-off: Icecast/Shoutcast without CORS cannot drive the radio Web Audio player or oscilloscope until the station enables headers.
- Radio playback path: see [ADR 0137](0137-radio-stream-player-web-audio.md) (amends earlier Howler/`captureStream` notes in this ADR).

## See also

- [ADR 0006](0006-plugin-system-for-room-features.md) — plugins cannot ship React
- [ADR 0049](0049-item-shops-and-shopping-sessions.md) — shopping sessions
- [ADR 0114](0114-player-item-gifting-and-trading.md) — gift/trade inventory removal
- [`docs/SHOP_ITEM_DEVELOPMENT.md`](../SHOP_ITEM_DEVELOPMENT.md) — `availableInRoomTypes`
- [ADR 0137](0137-radio-stream-player-web-audio.md) — radio Web Audio stream player

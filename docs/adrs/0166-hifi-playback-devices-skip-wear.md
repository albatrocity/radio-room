# 0166. Hifi playback devices skip wear

**Date:** 2026-09-08
**Status:** Accepted

## Context

[ADR 0160](0160-playback-device-gating.md) shipped four Record Store playback devices that gate
Physical Media queueing and still wear copies on queue ([ADR 0155](0155-physical-media-condition-wear-and-conversion.md)).
Legendary “hifi” variants of the single-format decks should play the same formats without grinding
the media — a deliberate upgrade under the existing 2-slot playback pool.

A shortId allowlist in `playbackDevices.ts` would drift from the SKUs. [ADR 0160](0160-playback-device-gating.md)
already put `playbackFormats` on the core definition so one catalog drives gating and copy;
gentle wear needs the same shape.

## Decision

1. **`gentlePlayback?: boolean` on `ItemDefinition`.** When true on a held device that lists
   `playbackFormats`, queueing a matching Physical Media copy does **not** degrade or convert it.
   Omit or `false` keeps today’s wear-on-queue. Authoring schema includes the field.

2. **Three Record Store SKUs** (legendary, `coinValue` 300, 50% sellback via existing
   `playbackDeviceSellbackValue`): Hifi Turntable (`LP`/`45`), Hifi Tape Deck (`TAPE`), Hifi CD
   Player (`CD`). Same durability flags as the base decks (`slotPool: "playback"`, tradeable,
   non-consumable). No Hifi Boombox; `maxPlaybackSlots` stays **2**.

3. **Wear skip in `wearRecordForQueue`.** Before ranking copies, if any matching grant’s
   `mediaFormat` is in `gentlePlayableFormats(inv.items)`, return without wearing. That covers both
   the device-gated path and the library-card path that still wears records. Device gating still
   uses the full `playableFormats` union (hifi units unlock formats like their base counterparts).

## Consequences

- With default 2 playback slots, a player cannot hold all three hifi units; they choose which
  formats to protect.
- Three 300-coin legendary SKUs can nudge The Fed’s median catalog price; they remain explicit
  economy outliers (same path as other expensive playback devices).
- Amends [0160](0160-playback-device-gating.md) with hifi SKUs and the gentle-wear rule; the
  original four devices and wear-on-queue for non-gentle decks stay valid.

## See also

- [0160. Playback-device gating](0160-playback-device-gating.md)
- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [`packages/plugin-item-shops/localLibrary/playbackDevices.ts`](../../packages/plugin-item-shops/localLibrary/playbackDevices.ts)
- [`packages/plugin-item-shops/items/hifi-turntable/`](../../packages/plugin-item-shops/items/hifi-turntable/)

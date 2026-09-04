# 0160. Playback-device gating

**Date:** 2026-09-04
**Status:** Accepted

## Context

Physical Media ([ADR 0155](0155-physical-media-condition-wear-and-conversion.md)) made holding a
record the only requirement to queue its tracks. The fiction is incomplete: you also need something
to play it on. Restoration items landed as [ADR 0159](0159-physical-media-restoration-items.md);
playback-device gating was the remaining follow-up named in 0155.

A tag on the bag (or a boolean "owns a player") cannot express four devices, two-format coverage
(Boombox), and a cap that makes the Boombox a space-saving choice rather than a strict upgrade.
[ADR 0100](0100-dual-inventory-slot-pools.md) already split the bag from Collection; a third pool
is the same pattern.

## Decision

1. **Third slot pool `"playback"`.** `ItemDefinition.slotPool` is
   `"inventory" | "collection" | "playback"`. `resolveSlotPool` is the single normalizer so
   three-way widening cannot drift. Session cap `GameSessionConfig.maxPlaybackSlots` defaults to
   **2** (you cannot hold all four devices). `UserInventory.maxPlaybackSlots` mirrors it. The
   Inventory tab renders a "Playback Devices" section only when non-empty, with no empty-slot
   placeholders (same Collection convention as ADR 0100 / ADR 0099 §10).

2. **`playbackFormats` on the core definition.** Devices declare which `PhysicalMediaFormat`s they
   play on `ItemDefinition.playbackFormats`. This lives on the definition (not a plugin-local map)
   so the client can render "Plays CDs and Cassettes" from the same source the server gates on, and
   so it parallels `mediaFormat` (what the item *is*). Devices do **not** set `mediaFormat` or
   `artworkFrame`, so `isPhysicalMediaDefinition()` stays false: they skip condition rolls,
   condition-scaled sellback, and wear.

3. **`mediaFormat` present ⇒ device required.** A grant requires a matching held device iff its
   definition carries `mediaFormat`. `scope: "library"` grants and operator-authored `perQueue` rows
   never set it, so both pass through. Only derived Physical Media sets `mediaFormat`. Admins inherit
   the existing wear exemption (`physicalMediaWearForAdmins: false` bypasses the whole queue
   validator); when wear is on for admins, admins need devices too.

4. **Format-filtered wear.** Owning an album on both LP and CD with only a Turntable must degrade
   the LP, never the CD. `wearRecordForQueue` takes the already format-filtered covering grants
   rather than recomputing its own matching set.

5. **50% `sellbackValue` override.** Record Store `listedBuybackRate` is **0.1** for used Physical
   Media. Devices are listed there, so the shop rate would return 8 coins on an 80-coin player (15
   on the Boombox). With `maxPlaybackSlots` defaulting to 2, selling is how you swap formats; a 90%
   haircut is a near-full repurchase. Each device sets `sellbackValue` at **50% of `coinValue`**
   (40 / 75), matching Sweetwater's listed rate for bag durables and ignoring whichever shop is
   currently open. Raising the shop-wide Record Store rate would also change records and restoration
   SKUs.

Four Record Store SKUs: CD Player / Cassette Deck / Turntable (80, uncommon) and Boombox
(150, rare). Durable, tradeable, `slotPool: "playback"`.

## Consequences

- Queueing a derived record without a matching device fails with
  `"You don't have anything to play this with."` via the existing `SONG_QUEUE_FAILURE` toast. The
  Add button that submitted the request also plays animate.css `headShake`. Browsing is unchanged:
  unplayable records stay visible in the catalog.
- Call sites that construct `UserInventory` or `GameSessionConfig` must include `maxPlaybackSlots`.
- A full playback pool does not block bag or collection purchases, and vice versa.
- Selling a device always quotes 50% of `coinValue`, even during a Record Store or Green Room visit.

## See also

- [0100. Dual inventory slot pools](0100-dual-inventory-slot-pools.md)
- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [0159. Physical Media restoration items](0159-physical-media-restoration-items.md)
- [`packages/plugin-item-shops/localLibrary/playbackDevices.ts`](../../packages/plugin-item-shops/localLibrary/playbackDevices.ts)
- [`packages/plugin-item-shops/items/shared/playbackDeviceSellback.ts`](../../packages/plugin-item-shops/items/shared/playbackDeviceSellback.ts)
- [`packages/types/Inventory.ts`](../../packages/types/Inventory.ts)

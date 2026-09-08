# 0165. Physical Media queue condition snapshot on Now Playing

**Date:** 2026-09-08
**Status:** Accepted

## Context

[ADR 0157](0157-physical-media-condition-artwork.md) §2 left Now Playing / queue / playlist
sleeves without a condition: frames resolve from playlist/album **membership** at read time
([ADR 0099](0099-physical-media-personal-libraries.md) §12), so the room always saw a mint
object even when the queuer spent a Good or Poor copy. After conversion the record is gone
from Collection, so looking up the queuer’s current inventory cannot recover the spent state
either.

Players need the sleeve to match the copy that was queued (pre-wear), while sleeve URLs and
the operator’s `showPhysicalMediaFrameInNowPlaying` toggle must stay read-time.

## Decision

1. **Queue-time snapshot only.** When Item Shops wears a durable Physical Media copy in
   `wearRecordForQueue`, it records the copy’s `MediaCondition` **before** degrade/convert.
   That value travels on `{ allowed: true, pluginData: { physicalMediaFrame: { condition } } }`
   from `validateQueueRequest`. [`PluginRegistry`](../../packages/server/lib/plugins/PluginRegistry.ts)
   merges each allowing plugin’s slice under the plugin name.
   [`DJService.queueSongAs`](../../packages/server/services/DJService.ts) persists
   `pluginData` on the `QueueItem` Redis blob. Persist **condition only** — not sleeve URLs
   or `artworkFrame`.

2. **Read-time merge.** `augmentNowPlaying` / `augmentQueueBatch` / `augmentPlaylistBatch`
   still resolve membership frames (urls + frame token). They copy
   `item.pluginData["item-shops"].physicalMediaFrame.condition` onto the outgoing frame when
   present. Absent / legacy blobs render mint (ADR 0157 absent → mint).

3. **Amends ADR 0157 §2 for Now Playing.** Collection, shop, and browse continue to pass
   condition from the held stack. Now Playing / queue / playlist use the snapshot when one
   exists. Visual wear only — no Mint/Good/Poor tag on Now Playing chrome.

4. **Library-scope / unrestricted / wear-off admins** produce no snapshot → mint, unchanged.

## Consequences

- Redis queue blobs gain a small `pluginData` exception to ADR 0099’s “blobs stay unchanged
  for frames” rule; the toggle still applies immediately because URLs stay read-time.
- `QueueValidationResult`’s allowed arm may carry `pluginData`; reject/defer are unchanged.
- Looking up the queuer’s Collection at Now Playing time is rejected: that would show
  post-wear or mint-after-convert, not the pre-queue copy.

## See also

- [0099. Physical Media personal libraries](0099-physical-media-personal-libraries.md)
- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [0157. Physical Media condition artwork as an overlay modifier](0157-physical-media-condition-artwork.md)
- [`packages/plugin-item-shops/localLibrary/index.ts`](../../packages/plugin-item-shops/localLibrary/index.ts)

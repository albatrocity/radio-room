# 0111. Physical Media rarity from ratings and title tags

**Date:** 2026-08-21
**Status:** Accepted

## Context

[ADR 0110](0110-catalog-mode-physical-media.md) (and [0099](0099-physical-media-personal-libraries.md)) derived Record Store rarity from `songCount` alongside price. Track count is a reasonable proxy for **how much music** a disc holds (and thus `coinValue`), but a short 45 is not “common” and a long CD is not “legendary.” Rarity also drives Record Store offer sampling weights (`DEFAULT_RARITY_WEIGHTS`), so song-count rarity made long filler scarce and short singles over-represented as commons.

Operators need independent control of rarity for prefixed playlists (no Navidrome rating on playlists) and a zero-config signal for catalog-mode albums.

## Decision

1. **Price stays song-count based** (`priceFromSongCount`). Format inference for albums also stays song-count / year based ([0110](0110-catalog-mode-physical-media.md) §2). This ADR does **not** change those.
2. **Rarity is a separate signal**, priority (first match wins):
   1. Playlist `physicalMediaOverrides.rarity` (admin escape hatch; `coinValue` override remains independent).
   2. Optional leading bracket rarity tags on prefixed playlist names: `[COMMON]`, `[UNCOMMON]`, `[RARE]`, `[LEGENDARY]` (case-insensitive), in any order with the format tag (e.g. `[LP][RARE] Loveless`, `[RARE][CD] Kid A`). Tags are stripped from the display title and do not affect price.
   3. Album `userRating` (Navidrome 1–5 stars) for catalog-mode SKUs, **and** for a prefixed playlist that shadows that album (0110 de-dup). Stars do not affect price. The daemon reads ratings from `getAlbumList2` when present and overlays `getAlbumList?type=highest` (Child.userRating) because Navidrome 0.63 may omit OpenSubsonic `userRating` on AlbumID3. Subsonic JSON may send ratings as strings; coerce to a finite 1–5.
   4. Fallback: `common`. Unrated albums and untagged playlists are filler bins.
3. **Star → rarity:** unset / 0 / 1 → `common`; 2–3 → `uncommon`; 4 → `rare`; 5 → `legendary`. Only finite ratings in 1–5 are copied from the daemon; missing `userRating` (old DJ Mac pack) fails closed to common.
4. **Playlist name parser:** consume a consecutive run of recognized format/rarity bracket tokens only. First unrecognized bracket ends the scan (e.g. `[LIVE][LP] Title` does **not** derive). A format tag is still required to derive a playlist SKU. Extra tags belong after the title, not before unrecognized prefixes.
5. **No per-album override table** in v1. Rate grails in Navidrome or shadow them with a prefixed playlist (+ optional override).

## Consequences

- A legendary 45 can still be cheap; a 5-star album remains scarce in the bins via existing rarity weights. Intended crate-digging.
- Unrated catalog libraries become a common-bin until operators star albums or use playlist tags.
- A prefixed playlist that exactly matches a rated album (0110 de-dup) inherits those stars, so rating in Navidrome still works when playlists win the SKU.
- Playlist titles gain optional rarity brackets; operators already use format brackets.
- Partially supersedes [0110](0110-catalog-mode-physical-media.md) §2 for **rarity only** (“Price/rarity stay song-count based” → price stays; rarity uses this ADR).

## See also

- [0110. Catalog-mode Physical Media](0110-catalog-mode-physical-media.md)
- [0099. Physical Media personal libraries](0099-physical-media-personal-libraries.md)
- [`packages/plugin-item-shops/localLibrary/physicalMedia.ts`](../../packages/plugin-item-shops/localLibrary/physicalMedia.ts)

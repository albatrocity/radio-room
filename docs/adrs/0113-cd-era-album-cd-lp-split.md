# 0113. CD-era catalog albums: 60/40 CD vs LP

**Date:** 2026-08-22
**Status:** Accepted

## Context

[ADR 0110](0110-catalog-mode-physical-media.md) inferred catalog-mode Physical Media format from track count and year: 1–3 tracks → 45; `year < 1983` → LP; `year < 1991` → cassette; otherwise (1991+ or missing year) → CD. That last bucket is the commercial CD era, but treating every long album as a jewel-case CD erases vinyl that stayed in print and the later LP revival. Prefixed playlists (`[CD]` / `[LP]`) still win when operators curate a title.

## Decision

1. **Unchanged from 0110:** `songCount` in 1–3 → 45; `year < 1983` → LP; `1983 ≤ year < 1991` → cassette. Prefixed playlist format tags and `physicalMediaOverrides` are untouched. Price stays song-count based ([0111](0111-physical-media-rarity-signals.md)).
2. **CD-era non-singles** (`year >= 1991`, or missing year on a longer album) are a **60% CD / 40% LP** split, not 100% CD.
3. **Deterministic from Navidrome album id:** FNV-1a 32-bit of the album id, then `hash % 100 < 60` → CD, else LP. The same album keeps the same format across refreshes. No extra config.
4. **Seed is required for the split.** `inferPhysicalMediaFormat(year, songCount, seed?)` uses the album id as `seed` at derivation. Omitting `seed` keeps the old CD fallback (tests / callers that only have year).

## Consequences

- Record Store bins in catalog mode mix jewel cases and jackets for 1991+ albums without operators tagging every title.
- A given album can flip CD ↔ LP if its Navidrome id changes (re-import); operators who care should shadow with a prefixed playlist.
- Partially supersedes [0110](0110-catalog-mode-physical-media.md) §2 for the CD-era branch only, and the “format stays 0110 year/count” clause in [0111](0111-physical-media-rarity-signals.md) §1.

## See also

- [0110. Catalog-mode Physical Media](0110-catalog-mode-physical-media.md)
- [0111. Physical Media rarity from ratings and title tags](0111-physical-media-rarity-signals.md)
- [`packages/plugin-item-shops/localLibrary/physicalMedia.ts`](../../packages/plugin-item-shops/localLibrary/physicalMedia.ts)

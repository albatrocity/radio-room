# 0102. Handwritten disc label for coverless jewel cases

**Date:** 2026-08-19
**Status:** Accepted

## Context

[ADR 0099](0099-physical-media-personal-libraries.md) requires both `imageUrl` and `artworkFrame` before the web client renders a Physical Media frame. Jewel-case records without playlist cover art therefore fall back to a Lucide icon or a gray placeholder, even though the SVG underlay already draws a tray, disc, and tabs suitable for an empty case.

Navidrome's Subsonic-compatible `getCoverArt` endpoint returns HTTP 200 with a bundled placeholder image when no art exists (`GetOrPlaceholder`), so the bridge daemon cannot distinguish a real sleeve from Navidrome's default blue vinyl by status code alone. Auto-generated 2×2 mosaics from album covers are treated as legitimate playlist art.

Operators who burn unlabelled CD-Rs need a way to mark a record as intentionally blank and show the title hand-lettered on the disc, like a Sharpie label.

## Decision

1. **`blankDisc` override:** Extend `physicalMediaOverrides` with an optional `blankDisc: boolean`. When true, `derivePhysicalMediaItems` omits `imageUrl` / `imageUrlLarge` even if Navidrome returned cover bytes. The Item Shops admin layout must list `blankDisc` in the `physicalMediaOverrides` `itemFields` array (Zod alone does not drive nested array row UI).
2. **Coverless jewel-case frames:** Relax the client gate in `toPhysicalMediaArt`: when `artworkFrame` is `jewel-case`, no `imageUrl`, and a display `name` is supplied, return `{ artworkFrame, discLabel }`. Other frame types without a cover still return `undefined` (icon / gray-box fallback unchanged).
3. **Label text:** `discLabel` strips the derived `"CD: "` prefix from default item names (`CD: Kid A` → `Kid A`). Operator `name` overrides pass through unchanged.
4. **Rendering:** `FramedArtwork` skips the cover `<Image>` when `imageUrl` is absent, forwards `discLabel` to `JewelCaseUnderlay`, and passes `coverless` to `JewelCaseOverlay` so insert-window borders and booklet sheen are omitted. The underlay draws the title on an SVG `<textPath>` arc across the disc crown using the Caveat handwriting font (Google Fonts, registered as `fonts.handwriting` in the Chakra theme). `fitDiscLabel` shrinks the font to a floor, then word-aware truncates with an ellipsis.
5. **Scope:** Shop offers, collection inventory, Add to Queue → Physical Media (item and track lists), and the artwork preview dialog. Now Playing / queue paths (`resolvePhysicalMediaArt`) are unchanged; they still require a sleeve or track album art URL.

## Consequences

- Operators must opt in per playlist via `blankDisc`; Navidrome placeholder detection is not attempted in this ADR.
- Coverless frames add a Google Fonts runtime dependency (Caveat), consistent with the existing Nunito link in `index.html`.
- ADR 0099 §11's "both `imageUrl` and `artworkFrame`" rule is extended for jewel case only; other frames and Now Playing behaviour are unchanged.
- Very long titles truncate on the disc; thumbnail sizes may render the minimum font size as barely legible ink.
- A follow-up could wire the record name into `physicalMediaFrame` for Now Playing / queue coverless discs.

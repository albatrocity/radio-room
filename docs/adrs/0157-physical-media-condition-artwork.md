# 0157. Physical Media condition artwork as an overlay modifier

**Date:** 2026-09-04
**Status:** Accepted

## Context

[ADR 0155](0155-physical-media-condition-wear-and-conversion.md) §6 reserved `artworkFrameForFormat(format, condition)` as the seam for per-condition artwork and left all three conditions pointing at the mint frame. Cashing that seam in as written would mean twelve `ArtworkFrame` tokens (`"jewel-case-poor"`, …) on a type that also travels the wire in `ItemDefinition`, `ShopOffer`, `PhysicalMediaNowPlayingFrame`, and `MetadataSource` payloads — and every consumer that switches on the frame would grow a 12-arm switch to draw what is still four objects.

Condition is not a different object. A Poor CD is the same jewel case with a crack in it.

## Decision

1. **Frame and condition are orthogonal props.** `ArtworkFrame` stays four tokens and keeps meaning "which physical object". `MediaCondition` rides alongside it as a second prop through `PhysicalMediaArt.condition` → `FramedArtwork` → `ArtworkFrameOverlay` → the per-format overlay, which modulates what it already draws. `resolveDisplayArtworkFrame` and `artworkFrameForFormat` keep their signatures and keep returning the format's one frame.

2. **Absent condition renders Mint.** Matches `readItemCondition`, which reads missing `metadata.condition` as mint. Now Playing resolves its frame from playlist/album membership rather than from the copy that was spent (ADR 0099 §11), so it has no condition to report and shows a pristine object.

3. **Wear lives where the material is.** Cases (`jewel-case`, `cassette-case`) crack in the plastic — an SVG overlay path — and fade in the paper, which is the cover `<img>` itself, so `insertConditionFilter` applies a CSS filter to that image. Sleeves (`record-jacket`, `die-cut-jacket`) are the artwork, so their scuffs scale in the overlay and a Poor sleeve loses its top-right corner through `cornerDentClipStyles` on the wrapper.

4. **The dent uses `clip-path`, not a mask layer.** 45s already spend `mask-image` on the die-cut spindle hole, and two `mask-image` layers composite as a union rather than an intersection. Keeping the two cuts on separate properties composes them without `mask-composite`.

5. **Good and Poor share one crack.** `JewelCaseCrack` renders a prefix of one fracture spine: Good stops four points in at the corner, Poor runs the whole diagonal. Degrading a copy therefore extends the break the player already saw instead of replacing it. Three `<path>`s — offset shadow, white body, bright core — and no SVG filters, so cost is flat across sizes; compact renders drop the shadow and splinters, matching the existing `useArtworkOverlayIsCompact` policy.

## Consequences

- Per-condition art is tuning tables (`WEAR`, `CRACK_SPINE`, `insertConditionFilter`), not new frame tokens or new components.
- Any render site that has a condition passes it; ones that do not (trade offers, pending gifts, Add to Queue browse rows) show mint until their payloads carry `condition`.
- A fifth format adds one overlay that reads `condition`, not three frame tokens.

## See also

- [0099. Physical Media personal libraries](0099-physical-media-personal-libraries.md)
- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [`apps/web/src/components/artworkFrames/`](../../apps/web/src/components/artworkFrames/)

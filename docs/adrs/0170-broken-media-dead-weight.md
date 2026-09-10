# 0170. Broken media is dead weight

**Date:** 2026-09-09
**Status:** Accepted

## Context

[ADR 0155](0155-physical-media-condition-wear-and-conversion.md) converted worn-out Physical Media
into Scratched CD / Dusty Record / Tangled Tape and treated those SKUs as skip-current-track
consumables. [ADR 0159](0159-physical-media-restoration-items.md) made them non-stackable (origin
metadata + slot tax) while they still skipped on Use. Playtesting found skip-from-wear too powerful:
players stocked junk as a cheap skip tool instead of treating worn copies as restore feedstock.

Green Room also listed Scratched CD (0155 §4) as fridge junk for that skip effect. With skip gone,
that listing no longer fits.

## Decision

1. **No Use / no skip.** Scratched CD, Dusty Record, and Tangled Tape have `consumable: false` and
   no `use` handler. They occupy an inventory slot and do nothing on their own.

2. **Cheap and common.** Catalog and Record Store price is 10 coins; rarity is `common`.

3. **Green Room does not sell broken media.** Supersedes 0155 §4 “Green Room keeps Scratched CD”.
   Record Store remains the only shop that lists the three broken SKUs.

4. **Restore path unchanged.** CD Cleaner / Dust Cloth / Pencil still target a broken stack and
   grant a `poor` copy ([ADR 0159](0159-physical-media-restoration-items.md)). Conversion still
   grants the matching broken SKU into inventory when a slot is free.

5. **Stay non-stackable.** `stackable: false, maxStack: 1` remains so `mediaOrigin` /
   `mediaOriginTitle` are preserved and each copy costs a slot (slot tax, not skip throttle).

## Consequences

- Worn-out media is dead weight until restored; skip is no longer a wear reward.
- Common cheap junk clogs the 3-slot bag more often — intended.
- Green Room loses the Scratched CD fridge gag; restore still requires a Record Store cleaner.

## See also

- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [0159. Physical Media restoration items](0159-physical-media-restoration-items.md)
- [`packages/plugin-item-shops/items/scratched-cd/index.ts`](../../packages/plugin-item-shops/items/scratched-cd/index.ts)
- [`packages/plugin-item-shops/items/dusty-record/index.ts`](../../packages/plugin-item-shops/items/dusty-record/index.ts)
- [`packages/plugin-item-shops/items/tangled-tape/index.ts`](../../packages/plugin-item-shops/items/tangled-tape/index.ts)

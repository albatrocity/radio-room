# 0126. Collection row opens item detail; Gift/Sell lives on detail

**Date:** 2026-08-28
**Status:** Partially superseded by [0127](0127-shared-item-detail-list-row.md) (shared row + bag Details chrome)

## Context

[ADR 0104](0104-game-state-item-detail-subroute.md) showed a Details secondary action on any item with `detailView`, and collection list rows also carried Gift/Sell. Those actions crowded the collection card (artwork + rarity + two buttons vs title/artist/description) for operations listeners rarely use from the list.

## Decision

1. **Collection items with `detailView`:** the entire list row is the detail action (keyboard-activatable). Do not render `ItemDetailActionButton` or Gift/Sell on that row. Artwork is non-interactive so it does not nest a button.
2. **Gift/Sell** for those items lives on the item detail view: above the track list when `layout: "trackList"`, below lore when `layout: "default"`.
3. **Inventory bag rows** keep Use / Gift/Sell on the row (Details is the shared row + caret — [ADR 0127](0127-shared-item-detail-list-row.md)). Collection items without `detailView` keep Gift/Sell on the row so the actions are not stranded. Shop detail never shows Gift/Sell (the viewer does not hold the item); shop Physical Media detail shows **Buy** in the same slot Gift/Sell occupies on inventory detail.

## Consequences

- Collection list cards can use the full width for title, artist, and description.
- Opening a collection item is one click on the card instead of a dedicated View control (ADR 0104 point 2’s “Details secondary action” no longer applies to this surface).
- Listeners must open detail to gift or sell a collection item.
- Shop Physical Media detail uses that same action slot for **Buy** (same `buy:{offerId}` action as the shop list). Item detail is outside plugin tab context, so Buy is a dedicated control rather than `ButtonTemplateComponent`.

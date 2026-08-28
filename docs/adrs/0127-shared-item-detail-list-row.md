# 0127. Shared item-detail list row

**Date:** 2026-08-28
**Status:** Accepted

## Context

Collection, inventory bag, and shop offers all present the same row: artwork, title, optional subtitle/description, and sometimes a path into [ADR 0104](0104-game-state-item-detail-subroute.md) detail. Those layouts had drifted (table vs card, View button vs whole-row click). [ADR 0126](0126-collection-row-opens-item-detail.md) fixed collection chrome; the same row should be one component.

## Decision

1. **`ItemDetailListItem`** (`apps/web/src/components/Modals/GameState/ItemDetailListItem.tsx`) is the Game State item row: artwork slot, title (optional addon), subtitle, description, optional trailing actions, optional detail navigation.
2. **When `onOpen` is set:** the artwork+title block is the detail action; a right caret sits at the far end of the row. Do not render `ItemDetailActionButton`. Artwork in that block is non-interactive so it does not nest a button. Trailing actions (Use, Buy, Gift/Sell) sit left of the caret and are not inside the detail click target.
3. **When `onOpen` is omitted:** no caret; trailing-only rows are plain cards (empty inventory slots stay a separate placeholder).
4. **Surfaces:** inventory bag, collection, and shop offers. Collection items with detail still omit Gift/Sell on the row ([ADR 0126](0126-collection-row-opens-item-detail.md)); bag Use / Gift/Sell and shop Buy stay in `trailing`.

## Consequences

- Shop offers use the same card row as inventory instead of a table (price + Buy are trailing).
- Bag items with `detailView` open via the row/caret like collection; the dedicated Details control on that row goes away.
- Gift/trade offer rows and playlist tracks are a different shape and stay on their own components.

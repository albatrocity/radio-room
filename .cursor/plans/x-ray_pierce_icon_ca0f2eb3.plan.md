---
name: X-Ray Pierce Icon
overview: When the viewer has X-Ray (`inventory_peek`), show the X-Ray item icon (`ScanSearch`) next to attribution names that were baked as a presented identity (e.g. “Somebody”) but are displayed as the real username due to pierce.
todos:
  - id: helper
    content: Add wasPresentedIdentityMasked / showXRayPierceIcon + X_RAY_ITEM_ICON helper + tests
    status: completed
  - id: chat
    content: Show ScanSearch beside pierced chat author names in ChatMessage
    status: completed
  - id: playlist
    content: Show ScanSearch beside pierced Added-by names in PlaylistItem
    status: completed
  - id: system
    content: Show ScanSearch cue on pierced system messages with maskedUserIds
    status: completed
isProject: false
---

# X-Ray icon on pierced disguised names

## Behavior

When `useHasInventoryPeek()` is true and an attribution was **masked at emit** (baked username ≠ live true username, or system `meta.maskedUserIds` present), show Lucide **`ScanSearch`** (X-Ray item icon from [`packages/plugin-item-shops/items/x-ray/index.ts`](packages/plugin-item-shops/items/x-ray/index.ts)) next to the **pierced** display name.

Non-X-Ray viewers keep seeing “Somebody” with no icon. Listener list stays real-only (no disguise) — no change.

## Detection helper

Extend [`apps/web/src/lib/presentedUsername.ts`](apps/web/src/lib/presentedUsername.ts) (or a tiny sibling) with:

```ts
wasPresentedIdentityMasked({ trueUsername, maskedUsername })
// true when maskedUsername is non-empty and differs from trueUsername

showXRayPierceIcon({ viewerPierces, trueUsername, maskedUsername })
// viewerPierces && wasPresentedIdentityMasked(...)
```

Export a shared constant `X_RAY_ITEM_ICON = "ScanSearch"` in the same web helper (avoid scattering the string).

## Surfaces

1. **Chat author headers** — [`ChatMessage.tsx`](apps/web/src/components/ChatMessage.tsx): when `showXRayPierceIcon(...)`, render `getIcon("ScanSearch")` beside `authorName` (the pierced real name). Replaces / coexists cleanly with the unused presented `usernameIcon` path for this case.

2. **Queue “Added by”** — [`PlaylistItem.tsx`](apps/web/src/components/PlaylistItem.tsx): same check on baked `addedBy.username` vs live username; icon next to the dj username chip.

3. **System messages** — [`SystemMessage.tsx`](apps/web/src/components/SystemMessage.tsx): when `pierce && meta.maskedUserIds?.length`, show a small `ScanSearch` icon before the pierced content line (one cue per system line; inline-per-token would need rich segments — out of scope).

## Tests

Unit-test the helper in [`presentedUsername.test.ts`](apps/web/src/lib/presentedUsername.test.ts): pierce + masked ≠ true → true; no pierce / no mask / equal names → false.

## Out of scope

- Listener list (always real)
- Changing pierce copy / `maskedUserIds` protocol
- Codebase-review skill (separate pass if you want it after this)

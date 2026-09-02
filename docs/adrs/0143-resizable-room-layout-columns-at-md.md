# 0143. Resizable room layout columns at md+

**Date:** 2026-09-02
**Status:** Accepted

## Context

[ADR 0118](0118-resizable-room-layout-columns.md) mounted the Chakra Splitter only at **lg (992px+)**, matching the integrated panel slot from [ADR 0117](0117-integrated-room-panel-slot.md). Between **md (768px)** and lg, the room still used `RoomMobileGrid`: three columns, fixed widths, no resize.

Those widths are the ones where chat often drops below ~380px. Users still need to rebalance Now Playing, chat, and listeners; they do not have room for a fourth docked Game State / Admin column.

## Decision

1. **Chakra Splitter at md (768px+)**. `Room.tsx` switches from `RoomMobileGrid` to `RoomDesktopSplitter` at `md`, not `lg`.
2. **Integrated panel stays lg+** ([ADR 0117](0117-integrated-room-panel-slot.md)). `useIntegratedPanelPresentation()` is unchanged (`modal` below lg, `panel` at lg+).
3. **md–lg is a 3-panel splitter only** (player, chat, sidebar). The fourth panel still appears only when presentation is `panel` and a slot is active — which cannot happen below lg.
4. **Below md**: `RoomMobileGrid` unchanged. Storage, layout keys (`layout3` / `layout4`), and panel constraints from ADR 0118 stay as they are.

## Consequences

- Tablets and small laptops can drag column widths; Game State and Admin Settings remain modals until lg.
- Narrowing chat on an md–lg splitter is how the stacked chat composer (game / prefs / upload under the input) gets used.
- Crossing md remounts grid ↔ splitter (same class of handoff ADR 0118 already had at lg). Crossing lg still swaps panel ↔ modal without changing the splitter itself.

## See also

- [0117. Integrated room panel slot (lg+)](0117-integrated-room-panel-slot.md)
- [0118. Resizable room layout columns (lg+)](0118-resizable-room-layout-columns.md) — Partially superseded by this ADR
- `apps/web/src/components/Room.tsx`
- `apps/web/src/hooks/useIntegratedPanelPresentation.ts`

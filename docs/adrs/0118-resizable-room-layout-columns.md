# 0118. Resizable room layout columns (lg+)

**Date:** 2026-08-26
**Status:** Partially superseded by [0143](0143-resizable-room-layout-columns-at-md.md) (splitter starts at md; storage, 3/4-panel keys, and constraints remain)

## Context

The room desktop layout fixed column widths via CSS Grid (`md` token, sidebar `18vw`, integrated panel `min(28rem, 32vw)`). Users could not adjust Now Playing, chat, listeners, or docked panel widths. [ADR 0117](0117-integrated-room-panel-slot.md) added a fourth column at lg+; widths remained hard-coded.

## Decision

1. **Chakra Splitter** at **lg (992px+)** replaces the horizontal grid row for player, chat, sidebar, and optional integrated panel.
2. **`roomLayoutMachine` / `roomLayoutActor`** store `layout3` and `layout4` percentage sizes; **`localStorage`** key `roomLayout:v1` (global prefs).
3. **Dynamic panels**: integrated panel open → 4-panel splitter; closed → 3-panel. Sizes cached per layout key.
4. **Below lg**: existing CSS Grid unchanged; integrated content stays modal.
5. **Inner chrome** (Sidebar, IntegratedPanelShell) fills splitter panels (`width: 100%`); no fixed `vw` widths or shell width animation.
6. Resize handles: separator-only, double-click resets layout to defaults, keyboard resize via Splitter.

## Consequences

- Users can tune column balance; prefs survive reload.
- Splitter mounts client-side only at lg+ (percentage sizes; no SSR hydration shift).
- Grid + Splitter coexist — `RoomMobileGrid` below lg, `RoomDesktopSplitter` at lg+.
- Integrated panel open/close swaps splitter panel set without losing cached proportions.

## See also

- [0117. Integrated room panel slot (lg+)](0117-integrated-room-panel-slot.md)
- [0143. Resizable room layout columns at md+](0143-resizable-room-layout-columns-at-md.md)
- [0105. Add to Queue UI session persistence](0105-add-to-queue-ui-session-persistence.md)
- `apps/web/src/lib/roomLayoutStorage.ts`
- `apps/web/src/machines/roomLayoutMachine.ts`
- `apps/web/src/components/RoomDesktopSplitter.tsx`

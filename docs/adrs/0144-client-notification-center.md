# 0144. Client notification center

**Date:** 2026-09-02
**Status:** Accepted

## Context

User-attention signals (toasts + entry-point / tab indicators) were spread across three parallel systems:

1. Trades/Gifts — `gameStateTradesGiftsAttentionMachine` flags, payload-derived inbox badges, and toasts fired from `giftInboxActor` / `*InboxNotifications` helpers, plus ad-hoc dismiss helpers.
2. Plugin tabs (bingo, item shop, newly offered tabs) — `gameStateNewPluginTabsMachine` `pendingIds` + sessionStorage, cleared via a module-level send sink.
3. Clear-on-view glue in `syncGameStateChildActors` as feature-specific calls.

Adding a new “prompt the user to go somewhere” path required wiring toast, badge, and clear rules by hand. [ADR 0115](0115-trade-invite-inbox.md) / [0129](0129-trade-session-lock-confirm-attention.md) / [0131](0131-trade-complete-inventory-toast.md) documented gift/trade policy but not a reusable client center. [ADR 0004](0004-state-machines-for-ui-and-socket-events.md) already prefers XState singletons for this class of coordination.

## Decision

1. **One global `notificationsActor`** (`notificationsMachine`) owns every attention **record** and toast side effect. Context: `{ roomId, location, items }`. Always started; room-scoped via `ROOM_ENTERED` / `ROOM_LEFT`.

2. **Sources only `raise` / `resolve` / `reconcile`.** Domain actors (e.g. `giftInboxActor`) and machines (plugin-tab detector) translate events into `NotificationSpec`s. The center must not learn trade/gift/bingo semantics.

3. **`NotificationTarget` + `NotificationLocation`.** A record aims at a surface (today: `gameState` + `tabId` + optional detail `frame`). `LOCATION_CHANGED` is fed from `syncGameStateChildActors` via a location sink (same cycle-breaking pattern as [ADR 0130](0130-game-state-overlay-lifecycle-in-machines.md) session sink). Matching and deep-link navigation live in `notificationTargets` / `navigateToNotificationTarget`.

4. **`clearOn: "view" | "resolve"`.**
   - **view** — flash; dropped when location reaches the target (plugin tabs, trade lock/confirm/accepted).
   - **resolve** — stays until `RESOLVE` / `RECONCILE` (server-backed pending gifts/invites). Viewing the tab dismisses the toast but keeps the indicator until the offer is gone.

5. **`dismissToastOn: "target" | "surface" | "never"`** (default `target`). Trade-accepted uses `surface` ([ADR 0129](0129-trade-session-lock-confirm-attention.md) point 4).

6. **No inbox UI.** The center is headless. Consumers: `useSurfaceHasNotifications(surface)` (entry-point dots) and `useTabNotificationIds(surface)` (tab dots). Pending gifts/invites still render from `USER_GAME_STATE` in Trades/Gifts.

7. **Persistence opt-in.** Only `persist: true` records (plugin-tab attention) go to sessionStorage (`notifications:{roomId}`). Gift/invite indicators are re-raised silently from `USER_GAME_STATE` + `RECONCILE` (server is source of truth).

8. **Notification id = toast id.** Stable ids preserve prior trade toast strings (`trade-invite-*`, `trade-lock-*`, …). Toast side effects go through `notificationToastPort` for testability.

9. **`giftInboxActor` remains the gift/trade *source*** (socket allowlist + trade watch diffs), not the toast owner. Plugin-tab machine keeps baseline / “newly offered tab” detection and raises into the center.

## Consequences

- One call stack for create/update/clear + toast; future surfaces (e.g. polls) add a `NotificationTarget` variant, a `navigateToTarget` case, and a location feed.
- Trade-off: the machine is mostly a keyed store with policy actions, not a rich lifecycle chart — chosen for consistency with ADR 0004 and `useSelector` ergonomics.
- Trade-off: location sink binding requires `notificationsActor` to load before nav sync matters (room lifecycle imports it).
- Partially supersedes attention/toast ownership in [0115](0115-trade-invite-inbox.md), [0129](0129-trade-session-lock-confirm-attention.md), and [0131](0131-trade-complete-inventory-toast.md); invite/session *product* rules and detection sites remain.

## See also

- [0004. State machines for UI and socket event handling](0004-state-machines-for-ui-and-socket-events.md)
- [0093. Client socket event allowlists](0093-client-socket-event-allowlists-and-shared-plugin-component-actors.md)
- [0115. Trade invite inbox](0115-trade-invite-inbox.md)
- [0129. Trade session lock/confirm attention](0129-trade-session-lock-confirm-attention.md)
- [0130. Game State overlay lifecycle](0130-game-state-overlay-lifecycle-in-machines.md)
- [0131. Completed-trade toast](0131-trade-complete-inventory-toast.md)
- `apps/web/src/actors/notificationsActor.ts`
- `apps/web/src/machines/notificationsMachine.ts`
- `apps/web/src/types/Notification.ts`

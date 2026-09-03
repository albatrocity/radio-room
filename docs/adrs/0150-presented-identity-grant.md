# 0150. Core presented-identity grant (optional engage toggle)

**Date:** 2026-09-02
**Status:** Accepted

## Context

Disguise hid actors as `"Someone"` only on item-shops system lines via the `anonymous_actions` modifier flag. Chat, queue `addedBy`, gifts/trades, and DJ announces still used real usernames. Future games (Werewolf, Mafia, etc.) need custom aliases without reusing personas ([ADR 0057](0057-user-personas-system.md) — badges only).

Users also need to **toggle** a disguise on/off during a timed window, while other plugins may grant a **fixed** presented identity with no toggle. The listener list must always show the true username; only **action attribution** follows presented identity. X-Ray pierce ([ADR 0149](0149-inventory-peek-flag-and-identity-pierce.md)) still reveals real names on masked surfaces.

## Decision

1. **Core grant** (Redis, not personas / not `pluginUserState`-only):
   - Fields: `userId`, `label`, `engaged`, `toggleable`, `expiresAt`, `source`, `sessionId`
   - Key: `room:{roomId}:presentedIdentity:{userId}` with TTL aligned to `expiresAt`
   - Ops: `grantPresentedIdentity`, `getPresentedIdentity`, `setPresentedIdentityEngaged`, `clearPresentedIdentity`
   - Exposed on `GameSessionPluginAPI` for plugins; Disguise is the first consumer (`label: "Someone"`, `toggleable: true`, `engaged: true`)

2. **Resolve rules** (`resolvePresentedIdentity` in `@repo/game-logic`):
   - Masked when grant is active and (`!toggleable` **or** `engaged`)
   - Otherwise use the real username
   - Emit paths bake the resolved label; system messages that mask still set `meta.maskedUserIds` for pierce

3. **Listener list always real.** Do not pass a masked label into list chrome.

4. **aboveChat identity chrome** (core React, not a plugin template):
   - Active grant + `toggleable`: Chakra `SegmentGroup` — real username | `label`
   - Active grant + `!toggleable`: read-only active label in the same slot
   - No grant: hide
   - Engage socket: `SET_PRESENTED_IDENTITY_ENGAGED` (rejects when `!toggleable` or expired)

5. **Fan-out:** include `presentedIdentity` on `USER_GAME_STATE`; emit `PRESENTED_IDENTITY_CHANGED` so the subject refetches/patches. Bake-at-emit for everyone else (chat `user.username`, queue `addedBy.username`, announces).

6. **`anonymous_actions`:** no longer the source of truth for attribution. Resolve prefers the grant; legacy `hasAnonymousActions` may remain as a short fallback until callers migrate. Disguise keeps a timed self-visible modifier for the effect-bar timer and clears/aligns the grant with that window.

## Consequences

### Positive

- One core API for Disguise and future identity games
- Toggle vs fixed grant without two UX systems
- History stays consistent via bake-at-emit; pierce stays on ADR 0149 paths

### Negative / trade-offs

- Emit call sites must remember to resolve; missed sites leak real names
- Chat pierce needs a live user lookup when the author left the room
- Separate Redis grant + modifier timer must stay aligned on duration

## Note (2026-09-03)

Two clarifications from implementation:

1. **Label value.** The attribution label is **`"Somebody"`** (`PRESENTED_IDENTITY_ANONYMOUS_LABEL` in `@repo/game-logic`), not the `"Someone"` used in the text above. Disguise grants that constant rather than a literal.
2. **Grant ↔ modifier binding.** `PresentedIdentityGrant` carries an optional **`modifierId`**. When a plugin passes the id returned by `applyTimedModifier`, core clears the grant as soon as that modifier is removed or expires. This replaces an earlier implementation in which `GameSessionService` matched the modifier **name** `"disguise"` — core no longer knows any plugin item, so a second identity item needs no core change. Grants without `modifierId` still expire on their Redis TTL.

The grant also carries optional `chromeLabel` and `icon` for the aboveChat control, which the decision above does not list.

## See also

- [0149. Timed `inventory_peek` flag and viewer identity pierce](0149-inventory-peek-flag-and-identity-pierce.md)
- [0057. User Personas System](0057-user-personas-system.md)
- [0046. Derived Modifier Flags](0046-derived-modifier-flags.md)

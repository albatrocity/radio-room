# 0184. Short-lived stash access grants (password-free retrieve)

**Date:** 2026-09-17
**Status:** Accepted
**Extends:** [0052](0052-global-artifacts-api.md), [0179](0179-reusable-multi-slot-password-stashes.md), [0182](0182-stash-last-touched-at.md)

## Context

Stashes are password-gated global containers. Today `attemptRetrieve(id, password)` is the
only path into a row's contents. Lock Pick items (ADR [0185](0185-lock-picking-items-and-crack-resolution.md))
need a password-free retrieve window after a successful crack, without weakening deposit
security or broadcasting imminent thefts.

Two rejected shapes drove the design:

1. **On-row grants disable the feature.** `applyArtifactUpdateWrite` sets
   `next.lastTouchedAt = now` unconditionally. Writing a grant through `update` would
   refresh the very clock Lock Pick reads, making a cracked stash immediately un-crackable
   again. Dodging that requires a `lastTouchedAt` bypass, which contradicts ADR 0182
   point 3. On-row grants would also be **public** — `getAll()` strips only the password
   — announcing every imminent theft to the room.
2. **Client bearer tokens add exfiltration surface for nothing.** `useInventoryItem` maps
   `ItemUseResult` to the client keeping only `success/message/title/duration/toastType`.
   The socket already authenticates the holder via `userId`; a code handed to the client
   would be stealable without buying the item.

## Decision

1. **Grants live in a separate TTL'd Redis hash**, keyed by viewer:
   `global:storedArtifacts:access:{userId}`. Field = `artifactId`, value = JSON
   `ArtifactAccessGrant`. Not on the artifact row; not sent to the client as a bearer
   token.

2. **10-minute TTL**, reset on every write to the viewer's hash. Per-field expiry is
   enforced at read time (`expiresAt`), so we do not require Redis 7.4 `HEXPIRE`.

3. **Single-use.** A grant is revoked only after a *completed* withdrawal inside
   `withArtifactLock` — mirroring ADR 0182 point 4. Failed attempts (wrong selection,
   full bag, busy lock) leave the grant intact so the holder can retry within the TTL.

4. **Retrieve only.** Deposit still requires the password. `attemptRetrieveWithGrant` is a
   separate union from `ArtifactRetrieveAttempt` so the password path cannot regress.

5. **`ArtifactsPluginAPI` gains:** `getPublic`, `grantAccess`, `listAccessGrants`,
   `attemptRetrieveWithGrant`, `revokeAccessGrant`. Listing decoration
   (`accessGrantExpiresAt` on `StoredArtifactPublic`) is applied in the room controller
   after `listAccessGrants(userId)` — plugins must not enumerate other users' grants.

6. **`retrieveStoredArtifact`** accepts `useAccessGrant?: boolean`, branches to
   `attemptRetrieveWithGrant`, and calls `revokeAccessGrant` after a successful persist.

## Rejected alternatives

| Alternative | Why rejected |
|-------------|--------------|
| Grant field on `StoredArtifact` | Refreshes `lastTouchedAt` via any `update`; public in `getAll()` |
| Bearer code in `ItemUseResult` | Not in client payload mapping; socket auth already binds user |
| Long-lived / multi-use grants | Turns a consumable item into permanent shared access |
| Grant sweeper on artifact delete | Cross-user index not worth 10-minute orphan keys |

## Consequences

- A successful crack consumes the item and mints server-side access; the user completes
  theft through the existing retrieve dialog (bounded by free slots).
- **Grant issued, bag full:** deliberately not gated on free slots — the TTL is the window
  to sell or gift something. Success copy states the ten-minute window.
- **Concurrent picks:** grants are per-user; two people can hold live grants on one stash.
  `withArtifactLock` serializes redemption — first empties, second gets `not_found`; orphan
  grant expires unused.
- **Stash emptied between crack and retrieve:** private failure, no refund. The pick buys
  an opportunity, not an outcome.
- **Session-id churn:** grants key on `userId`, which regenerates per session (ADR 0179).
  Regeneration inside the TTL loses the grant — accepted trade.
- **Grant outliving the stash:** `not_found`; orphan hash field expires with the key TTL.
- **Container return:** grant-retrieve that empties a stash may return someone else's
  container (ADR 0181) — intended.
- **Attribution on retrieve room line:** pre-existing retrieve posts via `displayName`
  without `maskedUserIds`; Lock Pick success line uses attributed messaging (ADR 0149/0150).
  Cheap follow-up: use `displayNameWithMaskMeta` on the retrieve line in the same change set.

## See also

- [0052. Global artifacts API](0052-global-artifacts-api.md)
- [0179. Reusable, multi-slot password stashes](0179-reusable-multi-slot-password-stashes.md)
- [0182. Stash `lastTouchedAt` stamped by the artifacts API](0182-stash-last-touched-at.md)
- [0185. Lock-picking items and the crack-resolution seam](0185-lock-picking-items-and-crack-resolution.md)

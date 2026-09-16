# 0179. Reusable, multi-slot password stashes

**Date:** 2026-09-16
**Status:** Accepted — points 4 and 8 partially superseded by [0181](0181-empty-stash-container-return.md)
**Extends:** [0052](0052-global-artifacts-api.md)

## Context

`context.artifacts` (ADR 0052) is the only cross-show persistence in a no-auth game: a password-gated bearer instrument in a global Redis hash. Four limits stopped it from carrying a rewards loop:

1. Containers (Van Cubby, Merch Cash Box) were destroyed on use.
2. A stash held exactly one payload and could not be topped up.
3. `giveItem` on retrieve passed `undefined` for metadata, so per-copy state did not survive a store → retrieve round trip.
4. The Storage list (then labeled "Stored Items") is global and public, with no way to label a row or leave a password hint.

`userId` is session-scoped and regenerates, so an owner check is impossible. Anyone with the password is the access rule.

Live production rows in `global:storedArtifacts` have no TTL. A dump from 2026-09-16 contained two v1 shapes (coin + item) with no `contents`, `containerDefinitionId`, `label`, or `note`. Those must stay retrievable without a migration.

Studio's `retrieveArtifact` had cloned the socket handler, including a live drift (`addScore` without `{ intent: "exact" }`).

## Decision

1. **`contents[]` is the v2 payload.** `ArtifactContent` rows carry a stable `id` (stamped by `normalizeArtifactPayload`) and item stacks keep `metadata`. v1 `artifactType` / `coinValue` / `itemDefinitionId` / `itemName` / `itemQuantity` remain as a **shadow write when `contents.length === 1`**, so a rollback mid-deploy can still read new rows. Legacy rows are read forever through `readArtifactContents()`; they are only rewritten if someone deposits or withdraws.

2. **No migration runs.** Every new field is optional. Absent is valid, not corruption. Emptying a legacy stash returns contents only — those containers were consumed under the old rules.

3. **Three bearer-gated operations:** create (use the container), deposit, selective withdraw. No owner check. `update` is a narrow patch (`contents`, `containerDefinitionId`, `label`, `note`) — it cannot rotate a password or reassign `storedByUserId`. Deposit only patches `contents`. `withArtifactLock` (`SET NX EX 10`) serializes retrieve/deposit.

4. **Container return** is keyed on `containerDefinitionId` written at create time (the full item definition id), **not** `storingItemId`. Studio-seeded artifacts omit the field and never take a sentinel branch. The container is returned last, only when contents hit zero. *(Partially superseded by [0181](0181-empty-stash-container-return.md): return is best-effort, and a stash emptied without returning its container persists as `contents: []` instead of being removed.)*

5. **`ItemDefinition.storageCapacity`** marks a container and supplies picker capacity. `isStorageContainerDefinition` replaces hardcoded shortId sets.

6. **Stash logic lives in `@repo/game-logic`** (`artifactStash.ts`): compat shim, planner, sanitizers, and user-facing copy. Server and Game Studio both call it.

7. **`label` (max 32) and `note` (max 140) are public, and are set only when the container is used from inventory.** Deposit does not rewrite them. `getAll()` strips only the password. The UI states "Everyone can see this." Over-cap input is **rejected**, not truncated. Neither string is interpolated into room system messages.

8. **Withdrawal is selective.** Absent `contentIds` still means take everything. The client picker enforces per-pool free slots and reserves one slot for the container when the selection would empty the stash; the server re-validates via `planWithdrawal`. Coins never consume a slot. Deposit merges coins into a single content entry. *(Partially superseded by [0181](0181-empty-stash-container-return.md): no slot is reserved for the container, the picker defaults to the contents that fit, and `contentIds: []` is how an empty stash's container is claimed.)*

## Consequences

- Containers are reusable; metadata (condition, punches) survives a stash.
- A shared Trailer two people both contribute to is an accepted emergent case.
- A password hint in `note` is a hint for every viewer of the global list.
- Compatibility for this Redis namespace is a standing rule, not a one-off: new fields stay optional; never rewrite unread rows at deploy time.

## See also

- [0052. Global artifacts API](0052-global-artifacts-api.md)
- [0104. Game State item detail](0104-game-state-item-detail-subroute.md)
- [0133. Stored artifacts fetched once per session](0133-stored-artifacts-once-per-session.md)
- [0155. Physical Media condition](0155-physical-media-condition-wear-and-conversion.md)
- [0156. Mutable inventory stack metadata](0156-mutable-inventory-stack-metadata.md)
- [0160. Playback-device gating](0160-playback-device-gating.md)
- [0162. Economy scale](0162-economy-scale-for-game-sessions.md)
- [0175. Item shop themes](0175-item-shop-themes-and-assignment-rarity.md)
- [0180. Tour Laminate](0180-tour-laminate-punch-accrual.md)
- [0181. Empty stashes persist; container return is best-effort](0181-empty-stash-container-return.md)

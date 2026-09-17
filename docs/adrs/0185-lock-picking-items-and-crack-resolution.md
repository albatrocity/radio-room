# 0185. Lock-picking items and the crack-resolution seam

**Date:** 2026-09-17
**Status:** Accepted
**Extends:** [0045](0045-inventory-item-targeting.md), [0179](0179-reusable-multi-slot-password-stashes.md), [0182](0182-stash-last-touched-at.md), [0184](0184-short-lived-stash-access-grants.md)

## Context

Spy World needs stash-cracking items: **Lock Pick** (120 coins shop price, 30% odds) and
**Locksmith's Kit** (250 coins, 75% odds). Targets must be stashes untouched for 60+ days
(ADR 0182). The room should see success only; failed rolls and ineligible targets stay
private.

A future **Tumbler Crack** minigame should replace the probability roll without rewriting
grant plumbing or retrieve integration.

## Decision

1. **`requiresTarget: "storedArtifact"`** — UI opens a stash picker; server receives
   `targetArtifactId` in item-use call context. Unknown socket keys are silently dropped,
   so the controller must allowlist the field.

2. **Eligibility in `@repo/game-logic`:** `STASH_PICKABLE_AFTER_MS` (60 days),
   `isStashPickable`, `stashUntouchedForMs`, `formatStashUntouchedFor`, and
   `stashNotPickableMessage` — one definition for server refusal and client picker.

3. **Refusal discipline:** ineligible target → `{ success: false, consumed: false }`.
   Failed probability roll → `{ success: false, consumed: true, toastType: "warning" }` (not
   a red Error). No room line on failure or refusal.

4. **`CrackResolver` seam** in `items/shared/crackStash.ts`: `rollCrackAttempt` today;
   `"deferred"` outcome reserved for Tumbler Crack. `issueStashPickGrant` is a separate
   step so a multi-round flow can grant without going through `use`.

5. **Two SKUs, one handler:** `useLockPickingItem({ successChance })`. Catalog
   `coinValue` stays on the rarity ladder (rare 50 / legendary 100); shop markup is
   120 / 250 in Spy World (ADR 0163).

6. **Success room line:** attributed via `resolveItemUseActorDisplayName` +
   `sendAttributedSystemMessage` (Disguise / X-Ray). Names the **container**, never
   `label`, `note`, or `storedByUsername`.

7. **No owner check** — picking your own stash is allowed (password recovery at cost).

8. **UI:** no global "Pickable" badge (would broadcast targets). Neutral "Last opened …"
   on storage rows; viewer-scoped **Open (picked)** when `accessGrantExpiresAt` is live.

## Consequences

- Server is authoritative on eligibility; stale client listings may offer a recently
  touched stash — refusal without consume on open refresh.
- Clock farming: any completed deposit/withdraw refreshes `lastTouchedAt` (ADR 0182) —
  inherent; UI must not label pickable stashes.
- Game Studio dev controls backdate `lastTouchedAt` on mock rows; production API cannot
   (ADR 0182 point 3).
- Studio-bridge snapshot does not carry per-user grants in v1 — Room UI preview may still
  show the password field; acceptable.

## See also

- [0045. Inventory item targeting](0045-inventory-item-targeting.md)
- [0179. Reusable, multi-slot password stashes](0179-reusable-multi-slot-password-stashes.md)
- [0182. Stash `lastTouchedAt` stamped by the artifacts API](0182-stash-last-touched-at.md)
- [0184. Short-lived stash access grants](0184-short-lived-stash-access-grants.md)

# 0182. `lastTouchedAt` is stamped by the artifacts API, not by callers

**Date:** 2026-09-16
**Status:** Accepted. Extended by [0184](0184-short-lived-stash-access-grants.md)
**Extends:** [0052](0052-global-artifacts-api.md), [0179](0179-reusable-multi-slot-password-stashes.md)

## Context

`storedAt` records when a stash was created and nothing else. Deposits and
withdrawals go through `ArtifactsPluginAPI.update`, which never touched it, so a
Road Case created in March and topped up yesterday looked identical to one nobody
has opened since March.

A future Lock Pick item wants to open stashes that have sat untouched for two or
more months, and "untouched" has to mean *no completed password-granted action*,
not *created long ago*. That clock only works if it has been running before the
item ships — a field added the same day would report every existing row as
untouched since creation.

## Decision

1. **`StoredArtifact.lastTouchedAt?: number`** is optional, like every other
   field added to this namespace (ADR 0179 point 2). No migration runs.

2. **The artifacts API is the clock**, not its callers. `store()` stamps the
   create, and `update()` stamps `Date.now()` after applying the patch — in
   `PluginArtifactsAPI` and in Game Studio's `MockStudioArtifactsApi`. Every
   `update` caller is downstream of an `attemptRetrieve` grant, so reaching it
   means a deposit or withdraw completed.

3. **`lastTouchedAt` is not part of `ArtifactUpdatePatch`.** A plugin cannot
   backdate the clock to keep a stash "fresh" or age someone else's stash into
   Lock Pick range, the same way it cannot rotate a password or reassign
   `storedByUserId` (ADR 0179 point 3).

4. **Only completed actions count.** A wrong-password attempt does not write, so
   it does not move the clock. Neither does a correct password whose operation
   then fails (a full bag, a stash busy behind the lock) — nothing reaches
   `update`. Hammering a stash with guesses therefore does not protect it.

5. **Reads go through `artifactLastTouchedAt(a)`** in `@repo/game-logic`, which
   falls back to `storedAt` when the stamp is absent, ignores a non-finite or
   non-positive stamp, and never reports a touch older than creation. One
   definition, so the future item and any UI cannot drift.

## Consequences

- The two-month clock starts accumulating real history now, before the item that
  reads it exists.
- `getAll()` strips only the password, so `lastTouchedAt` is public. The list
  already publishes `storedAt` and `storedByUsername`; this adds "how active is
  this stash", which is exactly the signal a Lock Pick holder is shopping for.
- Rows written before this ADR report their creation date until someone deposits
  or withdraws, which is the correct answer for a stash nobody has touched.
- A retrieve that empties a stash and returns its container deletes the row, so
  no stamp is needed; a retrieve that leaves contents or an empty row (ADR 0181)
  stamps on the way out.
- Password-free retrieve for Lock Pick is implemented in [0184](0184-short-lived-stash-access-grants.md).

## See also

- [0052. Global artifacts API](0052-global-artifacts-api.md)
- [0179. Reusable, multi-slot password stashes](0179-reusable-multi-slot-password-stashes.md)
- [0181. Empty stashes persist; container return is best-effort](0181-empty-stash-container-return.md)
- [0184. Short-lived stash access grants](0184-short-lived-stash-access-grants.md)
- [0185. Lock-picking items and the crack-resolution seam](0185-lock-picking-items-and-crack-resolution.md)

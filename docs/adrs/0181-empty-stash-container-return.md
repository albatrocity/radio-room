# 0181. Empty stashes persist; container return is best-effort

**Date:** 2026-09-16
**Status:** Accepted
**Partially supersedes:** [0179](0179-reusable-multi-slot-password-stashes.md) (points 4 and 8)

## Context

ADR 0179 reserved one slot for the container whenever a withdrawal would empty the
stash, and deleted the Redis row as soon as the remainder was empty. Together those
two rules made the common case fail: a Road Case holding three items, opened by a
listener with exactly three free bag slots, rejected the whole withdrawal because the
case itself needed a fourth. The picker disabled every checkbox and the copy blamed a
full inventory without saying which item did not fit.

Emptying a stash and pocketing its container are two different wants. Coupling them
meant the more common one (get my stuff) could not happen until the rarer one (get the
case back) also could.

## Decision

1. **Container return is best-effort.** `planWithdrawal` validates the deliveries
   first; only then does it *try* to add a slot for the container. If that one slot is
   missing, the deliveries still succeed and the result reports
   `containerBlocked: true` with no `container`. Deliveries that overflow on their own
   are still rejected wholesale.

2. **An empty stash is a valid row.** When a withdrawal empties a stash whose
   container could not be returned, the row is updated to `contents: []` rather than
   removed. Legacy rows (no `containerDefinitionId`) keep the 0179 behavior and are
   removed when emptied — those containers were consumed under the old rules.

3. **Claiming the container is a passworded retrieve with no selection.** For an empty
   stash, `contentIds: []` is accepted (it is still rejected for a non-empty one), and
   the plan delivers the container alone. If the container pool has no free slot, the
   retrieve fails and the row stays; the client disables the action and says
   *This won't fit in your inventory. Get rid of items to make space.* The password is
   required either way — an empty container is still a bearer instrument.

4. **`contents: []` is authoritative.** `readArtifactContents` treats any array as the
   v2 payload, so an emptied row no longer falls through to the v1 shadow fields and
   resurrect its old contents. Only an array whose every row is unreadable falls back
   to the shadow. Real legacy rows have no `contents` key at all, so their shim is
   untouched.

5. **The retrieve picker defaults to what fits.** `selectFittingContentIds` preselects
   every coin row plus the items whose pool still has room, in list order, reserving
   nothing for the container. Checkbox disabling still comes from
   `planWithdrawal(...).rejected`.

6. **Container name is hydrated at list time** alongside `storageCapacity`
   (`hydrateStoredArtifactContainers`), because the container is out of the viewer's
   bag while its stash exists and Game State has no definition for it. The empty row
   then reads "Road Case is empty." and its action reads **Move to inventory**.

## Consequences

- A full withdraw always works if the contents fit, and the case is no longer a
  hostage; it waits in Storage until the owner (or anyone with the password) has room.
- The Storage list can show rows that hold nothing. `artifactSummaryLabel([])` already
  returned "Empty", and the list row now states which container is empty.
- Empty rows have no TTL, so a forgotten password leaves a permanent inert row. Same
  exposure as any other stash under 0052; accepted.
- Two people can race for one empty container. The `withArtifactLock` serialization
  from 0179 makes the loser's attempt a "no longer exists" failure.
- The Game State tab is labeled **Storage** (was "Stored Items"); item descriptions
  point there.

## See also

- [0052. Global artifacts API](0052-global-artifacts-api.md)
- [0133. Stored artifacts fetched once per session](0133-stored-artifacts-once-per-session.md)
- [0160. Playback-device gating](0160-playback-device-gating.md) (slot pools)
- [0179. Reusable, multi-slot password stashes](0179-reusable-multi-slot-password-stashes.md)

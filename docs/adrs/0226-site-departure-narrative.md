# 0226. Site departure narrative

**Date:** 2026-10-30
**Status:** Accepted

## Context

A site's `narrative` posts when the van stops ([0212](0212-site-narrative-chat.md)). Departure outcomes can unlock a layer as the van pulls away ([0223](0223-site-departure-outcomes.md)), but nothing in chat explains why. Authors want a line like "Before you leave, the shop owner tells you about a secret passage a couple miles ahead," followed by the unlock.

## Decision

1. **`site.narrative` is the on-visit prose.** Its name, limits, and timing are unchanged, so saved maps keep working. `schemaVersion` stays 1.
2. **`site.departNarrative`** (1–2000 characters) and **`departNarrativeVariant`** are optional. Blank copy posts nothing.
3. **It posts on the same leave as `onDepart`:** the site enters `visited` from `parked` (`SITE_LEAVE`) while the trip is still `driving`. Ending the trip while parked, arriving at the destination, a skip, a bypass, and a tow past the site do not post it.
4. **Chat order on leave:** the shop closes, the departure paragraph posts, then `onDepart` outcomes apply (a layer's sign), then "Back on the road".
5. **`SiteRuntime.leftAt`** is set on that leave, whether or not the copy is blank. The Trip tab (`TripStoreSite.departNarrative`) and the room export's trip summary show the departure paragraph only once `leftAt` is set, after the visit paragraph. `tripNarrative` returns one entry per moment (`visit`, `depart`).
6. **Game Studio** groups both under the site inspector's Lifecycle section: On visit (narrative, variant, outcomes) and On departure (the same).

## Consequences

- Authors can tell the story that sets up a departure unlock.
- The final destination can store `departNarrative` but never posts it; the inspector says so.
- `leftAt` is a new persisted field. Trips saved before it have no departure paragraph in their summary.

## See also

- [0212. Site narrative is chat prose](0212-site-narrative-chat.md)
- [0223. Site departure outcomes](0223-site-departure-outcomes.md)

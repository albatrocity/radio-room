# 0229. Poll presentation can name its subject

**Date:** 2026-10-25
**Status:** Accepted

## Context

A pull-off poll renders as a road sign ([0216](0216-presentation-themes.md)). The sign names a stop, and a listener should be able to open that stop in the Trip tab. Matching the headline to a site name is brittle: headlines are uppercased and truncated, and two stops can share a name. The poll already carries plugin-only presentation metadata. A mystery poll must not identify its site ([0213](0213-road-trips-v1.md)).

## Decision

1. **`Poll.presentation` gains optional `subjectId`.** It is a string of 1–64 characters, the id of whatever the sign names. `createPoll` still keeps presentation only for plugin-sourced polls and validates it with the same schema. Voting ignores the field.
2. **Road-trip skip polls set it to the site id** when the sign names the stop. A mystery poll omits it, so the id is not on the wire.
3. **The road-trip poll theme opens that site.** When `subjectId` matches a revealed site in the trip store (the site has a name), the road sign is a button. Clicking it opens `road-trip-site-detail` on the Trip tab, the same detail a site row opens. A missing id, or an id the store has not revealed, leaves the sign inert. Other themes ignore the field.

## Consequences

- The link does not depend on headline text.
- A plugin that sets `subjectId` on a poll whose subject should stay hidden would leak the id to every client. Road-trip does not do that for mystery polls. The theme still will not open a site the store has not revealed.
- Old clients ignore the field. A poll written before this field still renders; its sign is not a link.

## See also

- [0213. Road trips v1](0213-road-trips-v1.md)
- [0216. Presentation themes](0216-presentation-themes.md)

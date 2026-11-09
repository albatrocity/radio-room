# 0230. Trip conditions and key items

**Date:** 2026-11-09
**Status:** Accepted

## Context

A trip can change *where* the van goes (layers, routes, diverts; [0222](0222-trip-flow-and-branches.md)), but not *what a site does* based on what the group has done. Authors want a stop to behave differently when the group picked something up earlier. For example, leaving a scenic overlook hands the group a ticket stub, and at a later stop the owner recognizes it and opens a layer the group couldn't see before. Adding a `requiresX` field per feature would mean editing every surface again for each new kind of fact.

## Decision

### Conditions

1. **One recursive condition, `TripCondition`** (`@repo/road-trip-map` `schema.ts`): a leaf `{ has: keyId }`, plus `{ not }`, `{ all: [...] }` and `{ any: [...] }`. It nests at most 4 levels deep, with 1–8 children per list. The TypeScript type is declared by hand and the zod schema is annotated `z.lazy`. A `superRefine` enforces the depth limit.
2. **Conditions ask a `ConditionFacts`, never trip state.** `evaluateCondition(c, facts)` only calls `facts.hasKey(id)`. The runtime builds facts with `conditionFacts(state)` (`plugin-road-trip/trip/state.ts`, from `state.keyItems`). Game Studio builds them from its simulator. A new fact source (layer state, visited sites, a `flag`) is one schema leaf, one `ConditionFacts` method, and one lint rule. No consumer changes.
3. **Where a condition can sit:** an optional `when` on every outcome kind, on each `narrativeCases` / `departNarrativeCases` entry, and on shop offers. Each consumer filters its list with the shared helpers (`conditionHolds`, `filterByCondition`, `narrativeCaseIndex`). Event and choice outcomes share the outcome schema, so their `when` parses and is evaluated too. This version builds no authoring UI or tests for those surfaces.
4. **Snapshot semantics.** `flow/outcomes.ts`, still the only outcome interpreter, checks every `when` in one `APPLY_OUTCOMES` list against the trip as the list started. A `give-key` therefore never satisfies a `when` later in the same list. Lint warns about that (`condition-reads-same-list-grant`, for an earlier `give-key` or `take-key`).
5. **Conditions are checked when their behavior fires**: when outcomes apply, when a narrative posts, and when a shop opens. They are never re-checked later.

### Key items

6. **A trip defines its key items:** `map.keyItems[]` (at most 16), each with `id`, `name`, `icon` (default 🔑), `description`, `foundNarrative` and `coinValue` (default 0). `schemaVersion` stays 1. Each key is also the inventory item `road-trip:key-{id}` (`tripKeyItemDefinitions`), which is inert: not consumable, stackable or tradeable. Road Trip registers these definitions next to the trip maps ([0227](0227-trip-defined-maps.md)) on `register` and on `loadMap`, so a site shop can sell one.
7. **The van holds key items, and only key items.** `TripState.keyItems: Record<keyId, { at, by }>` is a set: a key is held once. `by` is the `OutcomeSource`, or `{ kind: "purchase", userId, name }` for a bought key. "The group has X" means X is in the van. Members' inventories are not scanned. `normalizeTripState` defaults the field to `{}` for trips saved before it existed.
8. **A `key` machine per key item** (`absent → held` on `GIVE`, `held → absent` on `TAKE`). It is owned by the new van entity (`flow/entities/van.ts`), the only writer of `state.keyItems` (ownership rule 4 in `flow/architecture.test.ts`). Flow events: `KEY_GIVE { key, by, narrative? }`, `KEY_TAKE { key, by }`. Keys move while the trip is `loaded` or `driving`.
9. **New outcome kinds:**
   - `give-key { key, narrative? }` puts the key in the van and posts `narrative`, else the key's `foundNarrative`, as chat prose. Giving a key the van already holds is not a machine move: nothing changes and nothing posts.
   - `take-key { key }` removes the key.
   - `give-item { item, to: "everyone" | "random", qty ≤ 3 }` becomes `ITEMS_GIVE`, a handler that emits a `give-items` effect. After the CAS the plugin reads the online room users (`api.getOnlineUserIds`). It gives the item to each of them, or to one picked by the trip seed and the effect's `pick` (`giveItemsRecipients`), through `inventory.giveItem(..., "plugin")`. A road sign then names who got it. Key items go in the van with `give-key`, not with `give-item`.
10. **Departure order** keeps [0223](0223-site-departure-outcomes.md) and [0226](0226-site-departure-narrative.md): the shop closes, the departure narrative posts, `onDepart` outcomes apply (a key's found narrative among them), then "Back on the road".

### Narratives

11. **First match replaces.** `site.narrativeCases` and `site.departNarrativeCases` hold at most 8 cases each, `{ when, text, variant? }`. The first case whose `when` holds replaces `narrative` / `departNarrative`, and a case without a `variant` keeps the site's own. No case matching falls back to the plain field. Arrival cases are checked as the site is marked visited, before `onVisit` runs. Departure cases are checked on the leave, before `onDepart` runs.
12. **The chosen case is recorded** on the site runtime (`narrativeCase`, `departNarrativeCase`), so the Trip tab (`TripStoreSite.narrative`), the room export's narrative and the tow-in and destination narrators replay the text that actually posted, even after the van's keys change.

### Shops, clients, authors

13. **Offers.** An offer whose `when` fails, or that sells a key the van already holds, is left out when a stop's shop opens (`siteShopRequest(site, facts)`). Item Shops never sees `when`. A bought key moves from the buyer's inventory into the van, credited to the buyer. Plan Phase 3 builds this intake.
14. **Van sheet.** `TripStoreVanSheet.keyItems` lists the van's keys oldest first, each with its icon, name, description and `givenBy` (site, event, traveler, or "The host"). The field is absent when the van holds none.
15. **Authors.** The lint rules are `unknown-key`, `duplicate-key-id`, `key-never-given` (a warning; a shop offer counts as a source) and `condition-reads-same-list-grant`. `describeTripFlow` lists key items with who gives, takes, sells and reads each, and names conditional sources "Site (if van has X)". The simulator (`TripSim.setKeyItem`, `TripSimRoom.toggleKeyItem`) can toggle a key as the host. Its chat renders found narratives and handout signs.

## Consequences

- A site can branch on what the group did earlier without new routes. Unlocking a locked layer under a condition is enough to reveal content no one could see before, because locked layers never reach clients.
- Authors can be surprised by snapshot semantics. The lint warning and this ADR are the only guards.
- `give-item` to `everyone` scales with the room. `qty` is capped at 3, and sites can't be revisited today.
- Buying a key while no trip runs (or on a trip that doesn't define it) leaves an inert item in the buyer's inventory.
- Key moves aren't written to the trip log yet, so the Trip tab's event log and the export timeline don't show them.

## See also

- [0222. Trip flow and branches](0222-trip-flow-and-branches.md)
- [0223. Site departure outcomes](0223-site-departure-outcomes.md)
- [0226. Site departure narrative](0226-site-departure-narrative.md)
- [0227. Trip-defined maps](0227-trip-defined-maps.md)
- [0229. Site system messages](0229-site-system-message.md)

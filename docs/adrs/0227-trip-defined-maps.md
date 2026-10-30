# 0227. Trip-defined maps unlock the layers that opt into them

**Date:** 2026-10-30
**Status:** Accepted

## Context

[0222](0222-trip-flow-and-branches.md) shipped one built-in knowledge item, Local Map (`local-map`). Using it unlocked the next locked layer, in authored order, whose `unlockItems` listed it. An author couldn't say which layers a map reveals, couldn't sell different maps at different stops, and a room that skipped a layer's unlocking site had no way back to the stops still ahead on that layer.

## Decision

1. **A trip defines its maps.** `map.maps[]` (at most 16): `id`, `name`, `icon` (default 🗺️), `description`, `coinValue` (default 25). `schemaVersion` stays 1.
2. **A layer opts in.** `layers[].maps` lists the map ids that reveal it (at most 8). `layers[].unlockItems` is removed. Zod drops it from old JSON, so no shim.
3. **A map is an ordinary inventory item**, `road-trip:map-{id}` (`tripMapItemShortId`). `tripMapItemDefinitions(map)` in `@repo/road-trip-map` builds the definitions. Road Trip registers them on `register` (from the stored map) and in `loadMap` before site shops are validated, so a site's `shop.offers` can sell one. Price follows the offer's `basePrice`, else `coinValue`.
4. **One use unlocks every still-locked layer that lists the map**, in authored layer order, in one `dispatch` of `LAYER_UNLOCK` events. It works while the trip is `loaded` or `driving`, and the item is spent only if at least one layer changed. It's refused once every opted-in layer is unlocked. 0222 decision 10 still applies: content behind the van is missed.
5. **Lint:** duplicate map ids and unknown map references are errors; a map no layer opts into is a warning. A map opt-in counts as an unlock for "nothing unlocks this layer". `describeTripFlow` lists a layer's maps by name.
6. **Game Studio** authors maps (a Map button and inspector), offers them in the site offer picker, registers them on the sandbox inventory when the trip sim loads, and gives the sim page a Use button per map.

Trip Guide is unchanged.

## Consequences

- A room that skipped a Welcome Center can buy the local map further on and still reach the stops ahead.
- Map items exist per trip. Their definitions stay registered in the room after the map is unloaded, the same as other plugin definitions; an orphan copy just refuses on use.
- Partially supersedes 0222 decisions 9 (`unlockItems`) and 14 (Local Map). The rest of 0222 stands.

## See also

- [0222. Trip flow and branches](0222-trip-flow-and-branches.md)
- [0207. Trip Maps as portable JSON](0207-trip-maps-portable-json.md) (site shops)
- [0213. Game Studio trip simulator](0213-game-studio-trip-simulator.md)

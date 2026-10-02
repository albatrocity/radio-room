# 0202. Trip Maps as portable JSON

**Date:** 2026-10-02
**Status:** Accepted

## Context

A road trip ([0200](0200-road-trips-v1.md)) needs a route and a list of sites with copy, icons, images, lore, shop choices, and poll settings. Hosts design trips ahead of time, in Game Studio, and run them in any room, sometimes more than once. The format has to be checked in three places: the Game Studio editor, the plugin when a map loads, and tests.

Alternatives considered:

- **Plugin config fields.** The admin config form can't express a list of sites with nested settings. A `replace` segment activation would also wipe the map.
- **A database table.** That is persistence and UI for something that is really a document, and maps wouldn't move between environments.

## Decision

1. **New pure package `@repo/road-trip-map`.** It contains the Zod schema (`tripMapSchema`, `schemaVersion: 1`), derived values (`routeMiles`, `resolveSiteSettings`, `revealMileAtBaseSpeed`, `skipPollQuestion`), `lintTripMap`, site-library presets (generic ones plus one per Item Shops catalog shop), a content hash, a sample map, and the client store types (`TripStore`, `interpolateVanMile`). It has no I/O, so the plugin, the web client, studio-bridge, and Game Studio all import it.
2. **One validator: `parseTripMap(input)`.** It accepts a JSON string or a value. It enforces the size cap (800 KB), schema-parses with defaults applied, and lints. It returns `{ ok, map, hash, issues }`, and only error-severity issues fail. The Phase 1 lint rules are:
   - exactly one destination, at the route's end
   - unique site ids
   - sites closer than 0.1 mi (error: arrivals resolve one site at a time)
   - exits closer together than the skip-poll lead
   - a `mystery` poll whose question names the site (warning)
   - a destination that can't be reached before `deadlineAt`
   - unknown shop ids, when the caller passes the catalog

   Phase 2 adds two rules: `gas-desert`, a warning when the tank runs dry on the no-vote fuel plan (an empty tank starts Out of Gas), and `gas-at-destination`, a warning that the destination's gas is ignored.

   Phase 3 adds `duplicate-event-id` and `event-beyond-route` (errors), `no-mechanic` (a warning when a scripted Engine Failure has no Mechanic ahead, so a mobile mechanic repairs on the shoulder), `mechanic-at-destination` (warning), and unknown custom-offer item ids through `validateShop`.

   Phase 4 adds `non-cdn-asset`, a warning for a site image or model that isn't on the asset CDN ([0205](0205-shared-model-viewer-and-studio-site-assets.md)). Sites gain `model: { url }` (https `.glb`), projected only once visited.
3. **Authoring is in minutes (D6).** The route sets `driveMinutes` and `baseMph`, and miles are derived. Per-trip defaults live in `tuning` (`parkMinutes`, `revealMiles`, `skipPoll`, `seed`).
   - **Phase 2 fuel and funds.** The route sets `tanksPerTrip` (default 1.6), the full tanks the route burns at base economy, so mpg is derived and never authored. `tuning` adds `tankGallons` (15), `lowFuelPct` (0.15), and `funds: { mode: "automatic" | "voluntary", windowMinutes }` ([0204](0204-trip-funds-escrow-pool-and-levy.md)).
   - Sites gain `services.gas.pricePerGallon` (a base price, multiplied by the session's `costScale`).
   - `fuelPlan(map)` returns the no-vote gauge curve, gas stops, and the low and empty miles. It feeds the departure target, the gas-desert lint, and Studio.
   - The library adds a Gas station preset.
   - **Phase 3 van and incidents.** Maps gain `scriptedEvents: { id, atMile, incident }[]` (Traffic Jam, Blown Tire, or Engine Failure; Out of Gas comes only from fuel), `services.mechanic` (tow destination), and site `shop.offers`. The package also holds the van catalog (parts, consumables, `compileVan`), incident step lists, constant costs and timings, and `incidentCostEstimate`, so the plugin, Studio, and web share them. The Gas station preset now sells Fix-a-Flat and the AAA Card, and a Mechanic preset sells parts. Scripted events never reach clients.
4. **Stored in plugin storage.** An admin loads a map with the `loadMap` action by pasting JSON into Quick Access or plugin settings. Road-trip runs `parseTripMap`, then `shopAccess.validateShop` for every site shop ([0201](0201-declared-plugin-capabilities.md)), and writes `trip:map` as `{ map, hash, loadedAt, loadedBy }`. Errors block loading, and warnings are shown in the result message. The map can be replaced until departure and is locked after that.
5. **Self-contained.** Asset URLs are absolute, so the same JSON loads in any room. The map never reaches clients. They get the spoiler-safe projection described in 0200.
6. **Game Studio map editor.** It imports only `@repo/road-trip-map` and lets authors:
   - set route fields
   - add sites from the library and drag pins to set their mile
   - edit a site in the inspector, with a live poll preview and a catalog shop picker
   - see reveal ticks, projections (`parkPlan`, shared with the plugin), and the lint panel; the full parse and lint run once typing pauses
   - Copy JSON, import a pasted map, and keep a local draft
   - (Phase 2) set trip settings: tanks per trip, tank size, low-fuel share, funds mode, and pool window
   - (Phase 2) see the no-vote fuel curve under the route, with each gas stop's arrival level, gallons, and cost at a preview `costScale`
   - (Phase 2) toggle and price gas in the inspector
   - (Phase 3) place scripted incidents as draggable pins below the route, with a cost estimate at each mile; mark a site as a Mechanic; and pick custom offers with optional base prices
   - (Phase 4) drop an image or GLB on a site, preview it (the GLB on a live `ModelViewer` stage), and publish it to the CDN ([0205](0205-shared-model-viewer-and-studio-site-assets.md)); unpublished art blocks Copy JSON and Save

   A dev-only Vite middleware (`/__studio/trip-maps`) lists, reads, and writes `apps/game-studio/maps/<id>.json`. Ids must match the site-id slug pattern, and the size cap is 800 KB. A second one (`/__studio/assets`) publishes site art with the designer's AWS credentials.

## Consequences

- A map is a file. It can be shared, diffed, versioned with `revision`, and loaded again for a second run.
- Studio, the plugin, and tests can't disagree about validity, because they share one parser.
- Rooms load maps by paste only. Game Studio–published assets arrived in Phase 4 ([0205](0205-shared-model-viewer-and-studio-site-assets.md)); drag-and-drop map file loading in the room is not built.
- Changing the schema in a breaking way means bumping `schemaVersion` and migrating in `parseTripMap`.

---
name: Codebase review — feature/trips
overview: The branch follows the road-trip, voicemail, and shop ADRs. Remaining risk is three oversized modules and a handful of copied identities (voicemail subscription, pick keys, store keys, fund timing, studio album ratings).
todos:
  - id: r1
    content: "R1 — Mount one voicemail deck"
    status: completed
  - id: r2
    content: "R2 — One pickKey for trip authoring"
    status: completed
  - id: r3
    content: "R3 — Move trip fund I/O out of RoadTripPlugin"
    status: completed
  - id: r4
    content: "R4 — Pull queue validation out of LocalLibraryModule"
    status: completed
  - id: r5
    content: "R5 — One TRIP_STORE_KEYS list"
    status: completed
  - id: r6
    content: "R6 — Sim fund title and skip options match the live plugin"
    status: completed
  - id: r7
    content: "R7 — One fund hold duration"
    status: completed
  - id: r8
    content: "R8 — Studio live albums use the same rating overlay"
    status: completed
  - id: r9
    content: "R9 — Site-asset upload leaves TripMapEditor"
    status: completed
  - id: r10
    content: "R10 — Voicemail transport as a colocated machine"
    status: completed
  - id: r11
    content: "R11 — Point AGENTS.md at voicemail"
    status: completed
isProject: false
---

# Codebase review: feature/trips

**Date:** 2026-11-23
**Boundary:** `feature/trips` from `35ee26f122c100429a4f0680dee8f69f72c970e7` (tree) through `HEAD` (`1804d0eb`), plus one hop of callers in the same areas. 373 files, about +39668 / −1510.
**Depth:** standard (patterns, DRY, docs). A prior review of `fd13dce5`..`ff91cddd` is already done (`.cursor/plans/codebase-review-road-trip.plan.md`, R1–R4 completed). Those items were rechecked and left closed.
**Verdict:** Healthy architecture, mixed local structure. Plugins, capabilities, van motion, and voicemail sit in the layers the ADRs name. The next edit will trip on a shared socket subscription, two pick identities, and three files that keep absorbing unrelated methods.

## Inventory

| Layer | What landed |
|-------|-------------|
| Trip map | `@repo/road-trip-map`: schema, lint, `compileEventSteps`, van, store types |
| Plugin | `@repo/plugin-road-trip`: runtime in `trip/*`, host I/O in `index.ts`, sim entry `sim.ts` |
| Funds / shops | `plugin-base/helpers/funds.ts`; Item Shops `roomShop.ts`, `shopAccess`; physical-media stock and picks |
| Web | Road-trip templates, `roadTripVanMotionMachine`, presentation themes, `VoicemailDeck`, `showMusicControlMachine` |
| Game Studio | Trip map editor, trip sim page, record picker |
| studio-bridge | `stubRoadTrip.ts` fixtures, `tripSimState.ts` relay, `recordPicks.ts`, Navidrome snapshot ([ADR 0230](docs/adrs/0230-studio-navidrome-snapshot.md)) |
| Core | Voicemail REST + admin socket ([ADR 0212](docs/adrs/0212-show-voicemail.md)); `operations/playback/userPause.ts` ([ADR 0211](docs/adrs/0211-user-pause-and-play-start-hold.md)); skipper `skipOwnTracks` ([ADR 0210](docs/adrs/0210-skipper-own-track-skip.md)); bridge `playUrl` |
| Docs | ADRs 0210–0230, `AGENTS.md` plugin list, plugin guide |

New public surfaces stay inside those decisions: `shopAccess`, `TRIP_UPDATED` from the plugin, voicemail socket events, `playUrl`, presentation theme `"road-trip"`, `segment.role`. Trip rules stay in the plugin ([ADR 0006](docs/adrs/0006-plugin-system-for-room-features.md)). Domain emits in this range go through plugin `this.emit` or existing operations.

## Findings

| ID | Sev | Title | Location | Rationale |
|----|-----|-------|----------|-----------|
| F1 | P1 | Two voicemail decks share one socket subscription | `Sidebar.tsx`, `DrawerSchedule.tsx`, `VoicemailDeck.tsx` `subscribeById` | `subscribeById` replaces the subscriber for an id (`socketActor.ts`). Both parents mount `VoicemailDeck`, and both use `` `voicemail-deck-${room.id}` ``. The sidebar stays mounted when `hideBelow="sm"` hides it, and the schedule drawer mounts a second deck. The second subscribe wins; the first cleanup unsubscribes the shared id. |
| F2 | P1 | Pick identity is implemented twice, and one copy skips trim | `pickedRecords.ts` `pickKey` vs `tripMapDraft.ts` `pickKey` | Rooms key a pick as `` `${source}:${id.trim()}:${format}` ``. The editor copy does not trim `id`. `tripMapDraft.ts` already imports the Item Shops barrel. |
| F3 | P1 | `RoadTripPlugin` mixes the CAS pipeline with coin I/O | `packages/plugin-road-trip/index.ts` (~1268 lines) | `mutateTrip` / `settle` / `runEffects` / `publish` are the host loop. `openFund`, `settleOpenFund`, `chipIn`, `waiveIncidentFund`, and `poolOutcome` (~442–598 and ~1247) are the [ADR 0217](docs/adrs/0217-trip-funds-escrow-pool-and-levy.md) coin path and will be the next place a fund purpose lands. |
| F4 | P1 | `LocalLibraryModule` still owns queue redemption | `packages/plugin-item-shops/localLibrary/index.ts` (~1334 lines) | The file's own comment says the module is extraction-ready. This branch added picks, stock, shared playback, and `validateQueueRequest` / `validateSourceRecordQueue` / `wearRecordForQueue` (~960–1168) into the same class. Carry matching itself is already shared via `@repo/types`. |
| F5 | P2 | Road-trip store keys are hand-copied into the poll theme | `types.ts` `TRIP_STORE_KEYS`; `pollThemes/roadTrip.tsx` `ROAD_TRIP_STORE_SPEC` | The theme comment says the first `ensurePluginComponentActor` wins, so a stale list drops store fields for the room. Web depends on `@repo/road-trip-map`, and the plugin package entry loads `BasePlugin`. |
| F6 | P2 | Sim pool titles and skip-poll options are a second copy | `trip/simRoom.ts` `storePayload` (~276), `buildPoll` (~404–407); live titles come from `open-fund` effects (`Gas at ${site.name}`, `${label} · ${provider}`) and `SKIP_POLL_OPTIONS` | Question, urgency, and `liveSkipDefault` are already shared. The pool card title and the option list are not, so Game Studio's room preview can disagree with a room. |
| F7 | P2 | Fund hold length is copied in both openers | `trip/transitions.ts` `openGasFund` (~470–471); `trip/incidents.ts` (~455–456) | Same expression: automatic uses `AUTOMATIC_FUND_HOLD_MS`, voluntary uses `tuning.funds.windowMinutes`. A third fund opener will copy it again. |
| F8 | P2 | Studio live album list skips the rating overlay | `apps/studio-bridge/src/recordPicks.ts` `listLibraryAlbums` (~235–267) vs `apps/bridge-daemon/src/drivers/local.ts` `listLibraryAlbums` (~535–537) | The daemon merges `userRating` from `getAlbumList?type=highest` because Navidrome 0.63 omits stars on `getAlbumList2` ([ADR 0111](docs/adrs/0111-physical-media-rarity-signals.md)). Studio live mode reads `album.userRating` only, so sandbox rarity can diverge from a bridge room. [ADR 0230](docs/adrs/0230-studio-navidrome-snapshot.md) already shares one mapper between the studio's live and file backends; this is the live path vs the daemon. |
| F9 | P2 | Trip map editor also owns CDN upload | `TripMapEditor.tsx` `uploadAsset` / `discardPending` (~232–271) inside an ~801-line editor | Draft, selection, lint, JSON file I/O, and site-asset upload share one component. The next asset kind will be added here. Selection is already one `MapSelection` union (prior R1). |
| F10 | P2 | Voicemail transport is a pile of local state | `VoicemailDeck.tsx` (~720 lines; bridge vs `<audio>`, playing, position, scrub) | List and recording are already separate (`VoicemailRecorder`). Bridge-owned playback and the local element are mutually exclusive modes ([ADR 0004](docs/adrs/0004-state-machines-for-ui-and-socket-events.md)). A colocated machine fits; a new singleton actor does not. Depends on one mounted deck (F1) so the machine is not constructed twice. |
| F11 | P2 | `AGENTS.md` does not name voicemail | `AGENTS.md` structure and common tasks | Voicemail is core ([ADR 0212](docs/adrs/0212-show-voicemail.md)): REST in `voicemailController.ts`, admin socket in `voicemailAdminHandlersAdapter.ts`, playback via bridge `playUrl`. The plugin list and road-trip package line are current. `docs/PLUGIN_DEVELOPMENT.md` already describes road-trip. |

## Refactor plan (opt-out)

Each item is independent unless **Depends** says otherwise. Default: all included.

### R1 — Mount one voicemail deck
**Status:** completed
- **Addresses:** F1
- **Depends:** none
- **Files:** `apps/web/src/components/Sidebar.tsx`, `apps/web/src/components/Drawers/DrawerSchedule.tsx`, `apps/web/src/components/VoicemailDeck.tsx` only if the subscription id should include a slot
- **Change:** Render `VoicemailDeck` from the sidebar when the viewport is `sm` and up, and from the schedule drawer below `sm` (`useIsBelowSm` is already used by the drawer). Exactly one instance mounts. Keep the subscription id stable for that single instance.
- **Done means:** With a voicemail segment, opening the schedule drawer on a wide layout does not mount a second deck. On a narrow layout the drawer deck is the only subscriber. List, play, and hide still work on both layouts.
- **Risk:** Low. The hidden sidebar today still runs the deck's effects; this stops that.

### R2 — One pickKey for trip authoring
**Status:** completed
- **Addresses:** F2
- **Depends:** none
- **Files:** `packages/plugin-item-shops/index.ts` (re-export), `apps/game-studio/src/tripMap/tripMapDraft.ts`, `apps/game-studio/src/components/tripMap/TripPhysicalMediaService.tsx` (`add` already calls `pickKey`)
- **Change:** Re-export `pickKey` from `@repo/plugin-item-shops` the same way `validateRoomShopRequest` is re-exported. Delete the studio copy and import the shared function. Leave the search-hit disable set as `` `${source}:${id}` `` — those hits have no format yet.
- **Done means:** `tripMapDraft.ts` has no local `pickKey`. An id with surrounding whitespace keys the same in the editor and in `pickedRecords.ts`. Existing trip-map draft tests pass.
- **Risk:** Low. Trim can collapse two picks that previously differed only by whitespace.

### R3 — Move trip fund I/O out of RoadTripPlugin
**Status:** completed
- **Addresses:** F3
- **Depends:** none
- **Files:** new `packages/plugin-road-trip/trip/fundHost.ts` (name can match a sibling if one fits better), `packages/plugin-road-trip/index.ts`
- **Change:** Move `openFund`, `settleOpenFund`, `chipIn`, `waiveIncidentFund`, and `poolOutcome` into a helper the plugin calls. The helper takes the plugin context, trip storage, pool, and `mutateTrip` it needs. Leave `mutateTrip`, `settle`, `runEffects`, `publish`, polls, and map load on the class.
- **Done means:** `index.ts` no longer calls `collectShares` or `topContributors`. Fund tests in `index.test.ts` and `trip.test.ts` pass without behavior changes.
- **Risk:** Medium. The levy claim (`startLevy` before `collectShares`) has to move verbatim or a double-charge becomes possible.

### R4 — Pull queue validation out of LocalLibraryModule
**Status:** completed
- **Addresses:** F4
- **Depends:** none
- **Files:** new `packages/plugin-item-shops/localLibrary/queueValidation.ts`, `localLibrary/index.ts`
- **Change:** Move `validateQueueRequest`, `adminSkipsRecordGate`, `validateSourceRecordQueue`, and `wearRecordForQueue` into a module the class delegates to. Leave catalog refresh, picks, grants, and now-playing frames on `LocalLibraryModule`. Do not split Item Shops into a new plugin.
- **Done means:** `localLibrary/index.ts` no longer contains the queue-redemption branches. `localLibraryAccess` and playback-device tests pass.
- **Risk:** Medium. Wear and grant checks share inventory reads; the delegate needs the same private readers, passed in, so behavior stays identical.

### R5 — One TRIP_STORE_KEYS list
**Status:** completed
- **Addresses:** F5
- **Depends:** none
- **Files:** `packages/road-trip-map/src/storeTypes.ts` (or a sibling file in that package), `packages/plugin-road-trip/types.ts`, `packages/plugin-road-trip/schema.ts`, `apps/web/src/components/PresentationThemes/pollThemes/roadTrip.tsx`
- **Change:** Define the key list once in `@repo/road-trip-map`, which web already depends on. The plugin schema and the poll theme import it. Keep the theme's `{ pluginName, storeKeys }` wrapper local.
- **Done means:** Adding a store key is a one-line edit in the map package. The poll theme has no inline key array.
- **Risk:** Low. The list must stay identical on the first commit or the room actor keeps the old field set until reload.

### R6 — Sim fund title and skip options match the live plugin
**Status:** completed
- **Addresses:** F6
- **Depends:** none
- **Files:** `packages/plugin-road-trip/trip/simRoom.ts`, `packages/plugin-road-trip/types.ts` (`SKIP_POLL_OPTIONS`), the `open-fund` effect builders in `trip/transitions.ts` and `trip/incidents.ts` only if the title needs a shared helper
- **Change:** Give the synthetic sim pool the same title the live `open-fund` effect uses (`Gas at ${site.name}`, or `${label} · ${provider}`). Build sim poll options from `SKIP_POLL_OPTIONS` instead of inlined labels. Leave question, urgency, and presentation calls as they are.
- **Done means:** A gas fund in the trip sim shows the same pool title a room would. Changing `SKIP_POLL_OPTIONS` changes the sim poll too. `simRoom.test.ts` updates only where it pinned the old title.
- **Risk:** Low. Studio snapshots that assert "Gas money" need the new string.

### R7 — One fund hold duration
**Status:** completed
- **Addresses:** F7
- **Depends:** none
- **Files:** `packages/plugin-road-trip/trip/helpers.ts`, `trip/transitions.ts`, `trip/incidents.ts`
- **Change:** Add `fundHoldMs(mode, map)` and use it in `openGasFund` and the incident fund opener. Leave the short-fund sign copy arrays separate; those sentences are different on purpose.
- **Done means:** Both openers call `fundHoldMs`. A unit test covers automatic vs voluntary for one mode switch.
- **Risk:** Low. The expression is unchanged.

### R8 — Studio live albums use the same rating overlay
**Status:** completed
- **Addresses:** F8
- **Depends:** none
- **Files:** `apps/studio-bridge/src/recordPicks.ts`, `apps/studio-bridge/src/recordLibrarySource.test.ts` (or the existing record-picks test)
- **Change:** In the live branch of `listLibraryAlbums`, page `getAlbumList?type=highest` through the existing `subsonic()` helper and fill `userRating` when `getAlbumList2` omitted it, matching `LocalDriver.listLibraryAlbums`. Point a comment at that daemon method. Do not add a shared Navidrome client package.
- **Done means:** A studio live library row gets a star rating when only the `highest` list has one. File mode is unchanged ([ADR 0230](docs/adrs/0230-studio-navidrome-snapshot.md) decision 4).
- **Risk:** Low. An extra Subsonic request on library load in Game Studio.

### R9 — Site-asset upload leaves TripMapEditor
**Status:** completed
- **Addresses:** F9
- **Depends:** none
- **Files:** new `apps/game-studio/src/components/tripMap/useSiteAssetUpload.ts` (or a sibling module), `TripMapEditor.tsx`
- **Change:** Move `uploadAsset`, `discardPending`, and the pending-asset map into a hook the editor calls. Leave draft, `MapSelection`, lint, and JSON file actions in the editor. Game Studio stays on local React state ([ADR 0051](docs/adrs/0051-game-studio-client-sandbox.md)).
- **Done means:** `TripMapEditor.tsx` no longer calls `uploadSiteAsset`. Uploading, reusing, and discarding a site image still updates the draft URL.
- **Risk:** Low. Object URLs must still be revoked on discard and on success.

### R10 — Voicemail transport as a colocated machine
**Status:** completed
- **Addresses:** F10
- **Depends:** R1
- **Files:** new `apps/web/src/machines/voicemailTransportMachine.ts`, `apps/web/src/components/VoicemailDeck.tsx`
- **Change:** Model bridge-owned playback vs the local `<audio>` element, play/pause, and position in a `useMachine` next to the deck. Leave the date window, list fetch, and hide action as component state. Do not add a singleton actor.
- **Done means:** The deck cannot be "playing" on both the bridge and the audio element. `VoicemailDeck.tsx` drops the transport `useState` cluster. List and hide behavior stay.
- **Risk:** Medium. Socket acks and `<audio>` events both feed the machine; a missed event leaves the scrubber stuck.

### R11 — Point AGENTS.md at voicemail
**Status:** completed
- **Addresses:** F11
- **Depends:** none
- **Files:** `AGENTS.md`
- **Change:** Add a short structure or common-task note: voicemail is core, REST upload in `packages/server/controllers/voicemailController.ts`, admin inbox socket in `packages/server/handlers/voicemailAdminHandlersAdapter.ts`, bridge playback via `playUrl` ([ADR 0212](docs/adrs/0212-show-voicemail.md)). One or two sentences.
- **Done means:** A search of `AGENTS.md` for voicemail finds those two files.
- **Risk:** Low. Docs only.

## Documentation updates

- [x] R11 — `AGENTS.md` voicemail pointer
- [ ] `docs/PLUGIN_DEVELOPMENT.md`, the ADR index, and `apps/game-studio/README.md` already describe road-trip, the sim, and the Navidrome snapshot

## Explicit non-actions

- Prior review items stay closed. `MapSelection` is in `TripMapEditor`. `liveHold` is shared by `stripContext` and `stripReadout`. `VanPhase` lives in `apps/web/src/lib/roadTripVanPhase.ts`, and `roadTripVanMotionMachine` imports it from there. The machine uses `setup()` and `teardownRoadTripVanMotionActors()` runs from plugin-component teardown.
- `validateSiteShops` stays a second pass. Lint's `validateShop` hook is synchronous; room load calls the async `shopAccess` capability and must warn when Item Shops is absent ([ADR 0214](docs/adrs/0214-declared-plugin-capabilities.md) decision 5).
- `packages/road-trip-map/src/incidents.ts` compiles events. `packages/plugin-road-trip/trip/incidents.ts` runs them and calls `compileEventSteps`. [ADR 0228](docs/adrs/0228-trip-events.md) wants that split.
- `describeTripSim.ts` stays the designer trace. `formatTripTimelineMarkdown` stays the room export. They switch on the same `TripLogEntry` union with different sentences. `describeIncident` / `describePartInstalled` are already shared where the words match.
- `SHORT_GAS_COPY` and `SHORT_INCIDENT_COPY` stay separate. The pattern matches; the speakers do not.
- `urlPlayback` stays split: `packages/adapter-bridge/lib/urlPlayback.ts` is the RPC client, `apps/bridge-daemon/src/drivers/urlPlayback.ts` is the mpv sidechain ([ADR 0212](docs/adrs/0212-show-voicemail.md) decision 4).
- No new Navidrome client package. R8 uses the studio-bridge `subsonic()` helper that already exists.
- `ItemShopsPlugin` in `packages/plugin-item-shops/index.ts` stays the plugin shell. R4 only moves queue redemption. A future local-library plugin would need its own ADR; the file comment is a note, not a decision.
- `voicemailAdminHandlersAdapter` stays a socket handler registered from `adminController`, same shape as the other `*HandlersAdapter` classes. REST upload stays in `voicemailController.ts`.
- User pause stays in `operations/playback/userPause.ts` with the pure checks in `playbackHelpers.ts` ([ADR 0211](docs/adrs/0211-user-pause-and-play-start-hold.md)). `showMusicControlMachine` already owns the button.
- Skipper `skipOwnTracks` is a small branch in the existing plugin. No split.
- Game Studio trip sim imports `@repo/plugin-road-trip/sim`. `tripSimState.ts` is a relay. `stubRoadTrip.ts` is fixture data. No second trip engine.
- Presentation theme registry is a `Record<PresentationTheme, …>` and matches `@repo/types`. One theme id, `"road-trip"`.
- Road-trip panels do not share orchestrating `useState`. Phase goes through `useRoadTripVanMotion`.
- Collapsed road-trip polls render `ExpiryBar` and skip `theme.CloseBar` (`PollCard.tsx`). That is a behavior bug, outside this refactor plan.

## Opt-out checklist

Reply with decisions (keep is default):

- [x] R1 — keep
- [x] R2 — keep
- [x] R3 — keep
- [x] R4 — keep
- [x] R5 — keep
- [x] R6 — keep
- [x] R7 — keep
- [x] R8 — keep
- [x] R9 — keep
- [x] R10 — keep
- [x] R11 — keep

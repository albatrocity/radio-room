# Studio bridge

Local **Socket.IO + HTTP** server used to drive the real **web** Room UI (`apps/web`) from **Game Studio** (`apps/game-studio`).

- Listens on **`127.0.0.1:3099`** by default (`STUDIO_BRIDGE_PORT`).
- Game Studio POSTs serialized sandbox state to **`POST /sync`**.
- The web app points `VITE_API_URL` at this server and joins room **`studio-room`** (see `STUDIO_ROOM_ID` in Game Studio).

Started automatically via **`make game-studio`** alongside the Game Studio Vite dev server.

## Road trip preview

Set `STUDIO_BRIDGE_TRIP_PREVIEW=1` when starting the bridge (or connect with the `tripPreview=1` handshake query) to preview road-trip UI ([ADR 0205](../../docs/adrs/0205-road-trips-v1.md)) without the plugin:

- the `road-trip-strip` above chat and the **Trip** Game State tab (with site detail), from a fixture trip on `SAMPLE_TRIP_MAP`
- a road-sign skip poll and two road-sign system messages on login
- `EXECUTE_PLUGIN_ACTION` for `road-trip` swaps fixtures: `depart` / `resume` / `leaveNow` → driving, `previewFueling` → parked at the gas station with a voluntary gas pool open (`chipIn` with `{ amount }` raises it), `previewParked` → parked at a site, `previewIncident` / `triggerIncident` → a blown tire on the shoulder (Van tab shows the incident, the Fix-a-Flat hint, and the installed spoiler + AAA card), `skipIncidentStep` → driving, `previewArrived` → arrived, `endTrip` / `unloadMap` / `newTrip` → no trip. Each fixture carries the gas gauge anchor, so the strip gauge and the Van tab (mods, speed breakdown) render; road-trip items are not held in the sandbox, so the Van tab shows hints rather than Use / Install buttons; the preview chat shows road signs in all four variants. The stub has no config schema, so there is no Quick Access panel; send the event from the browser console when you need another fixture.

Fixtures live in `src/stubRoadTrip.ts`.

### Trip simulator relay

Game Studio's **Trip sim** page posts `{ roomId, snapshot }` to **`POST /trip-sim`** after every step ([ADR 0213](../../docs/adrs/0213-game-studio-trip-simulator.md)). `snapshot` is a `TripSimSnapshot` from `@repo/plugin-road-trip/sim` (store payload, trip chat lines, open poll, last closed poll), or `null` to clear it. It's kept beside the sandbox snapshot (`src/tripSimState.ts`), so `POST /sync` can't drop trip chat. While it's loaded:

- the bridge emits `PLUGIN:road-trip:TRIP_UPDATED`, `MESSAGE_RECEIVED` for new lines, and `POLL_PUBLISHED` / `POLL_CLOSED` as the sim's exit poll opens and closes
- LOGIN, `ROOM_DATA`, and `GET .../plugins/road-trip/components` merge the sim's chat, poll, and store, with no env flag
- it replaces the fixture; `road-trip` plugin actions from the Room UI are refused with a pointer back to Game Studio
- clearing it (or loading a new run) sends `MESSAGE_DELETED` for each of the old run's chat lines, and the store falls back to the fixture (or no trip)

## Out of scope (for now)

- **`QUEUE_SONG` / `SONG_QUEUE_HELD`** — not stubbed. Round Robin DJ held-queue toasts and deputy turn flow are exercised against the real API + `@repo/plugin-round-robin-dj`, not Game Studio. Add a preview flag + ack stub only if Studio needs to polish that client UX without the full backend.

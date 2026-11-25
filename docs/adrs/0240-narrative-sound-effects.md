# 0240. Narrative sound effects

**Date:** 2026-11-25
**Status:** Accepted

## Context

Site arrival and departure already post chat prose ([0220](0220-site-narrative-chat.md), [0235](0235-site-departure-narrative.md)), and trip departure posts the "On the road" sign. Authors want a sound to play at those moments without a new field for every cue. Game Studio already publishes site images and GLBs to the asset CDN ([0218](0218-shared-model-viewer-and-studio-site-assets.md)); pasted SFX URLs can move or disappear the same way hand-pasted art can.

## Decision

1. **`narrativeSounds` is an ordered list of `{ trigger, url }`.** `url` is an absolute https URL. The array is omitted when empty and capped at 8. `schemaVersion` stays 1.
2. **Site triggers** are `arrival` and `departure`. `arrival` queues when the van stops there (park, destination arrival, or a tow into a Mechanic). Driving past, a skip, and a bypass do not. `departure` queues when the site leaves while the trip is still `driving` ([0235](0235-site-departure-narrative.md)). Ending the trip while parked does not. A destination may store `departure` entries; they never play.
3. **Map triggers** use the same entry shape on `tripMap.narrativeSounds`, but only `departure` is allowed. That is trip departure (`TRIP_DEPART`). An arrival sting belongs on the destination site; the map schema rejects `arrival`.
4. **Several entries may share a trigger.** They queue in array order. A clip plays on its trigger even when the matching narrative prose is blank. Narrative cases still only replace text and system-message variant.
5. **Playback** is a `sound` trip effect. After the CAS, `runEffects` calls `queueSoundEffect({ url, volume: 0.6, duck: true })` room-wide ([0072](0072-plugin-user-targeted-sound-effects.md), [0174](0174-programme-ducking-for-sound-effects.md)). Clients that have Sound effects off drop the clip. URLs are not copied into the trip summary or the room export.
6. **Game Studio trip sim** records an ordered `sounds` list on `TripSimSnapshot` (parallel to `messages`). studio-bridge diffs new entries on the same run and emits `SOUND_EFFECT_QUEUED` so the preview hears them.
7. **CDN upload** extends [0218](0218-shared-model-viewer-and-studio-site-assets.md): `POST /__studio/assets?kind=sound` stores bytes as-is after a magic-byte check (MP3, WAV, or Ogg), capped at 2 MB, under `assets/maps/sounds/<sha256>.<ext>`. The existing map-designer policy already covers `assets/maps/*`; no IAM or Terraform change. `non-cdn-asset` warns on a sound URL that is not on the asset CDN. Pasted https URLs still work.

## Consequences

- Authors can attach one or more cues to arrival, site leave, and trip departure without new schema fields per moment.
- A later trigger (for example an event start) can join the same list shape.
- Orphan sound objects stay on the CDN the same way replaced site art does.

## See also

- [0072. Plugin user-targeted sound effects](0072-plugin-user-targeted-sound-effects.md)
- [0173. Asset CDN CORS for browser-decoded media](0173-asset-cdn-cors-for-browser-decoded-media.md)
- [0174. Programme ducking for sound effects](0174-programme-ducking-for-sound-effects.md)
- [0218. Shared ModelViewer and Game Studio–published site art](0218-shared-model-viewer-and-studio-site-assets.md)
- [0220. Site narrative is chat prose](0220-site-narrative-chat.md)
- [0235. Site departure narrative](0235-site-departure-narrative.md)

---
name: Performance review — feature/trips
overview: The trip does not tick and stays fine under one room of under 100 people. The show-time risk is paging the whole Navidrome library across the device socket to resolve a few local record picks, and repeating that walk for sleeves.
todos:
  - id: p1
    content: "P1 — Resolve local picks without a full library crawl"
    status: completed
  - id: p2
    content: "P2 — Cache listLibraryAlbums on the daemon"
    status: completed
isProject: false
---

# Performance review: feature/trips

**Date:** 2026-11-23
**Boundary:** `feature/trips` from `35ee26f122c100429a4f0680dee8f69f72c970e7` (tree) through `HEAD` (`6268c121`), plus one hop of callers on hot paths (plugin emit, bridge RPC, queue validation, plugin-component hydrate). 381 files. Maintainability items from `.cursor/plans/codebase-review-feature-trips.plan.md` are not repeated here.
**Scale lens:** current ≈ 1 room/month, <100 concurrent; growth possible
**Verdict:** Healthy at current load. Progress is schedule-driven, not polled. The hot spike is the first local record-pick resolution, which pages the entire Navidrome library twice and ships it over the device socket while a shop is opening.

## Findings

| ID | Sev | When | Title | Location | Failure mode |
|----|-----|------|-------|----------|--------------|
| F1 | P1 | Now | Local pick resolution pages the whole library | `LocalLibraryModule.libraryAlbums` → `PluginCatalogAPI.listLibraryAlbums` → `LocalDriver.listLibraryAlbums` | First `registerPicks` of a local pick (shop open, including a trip arrive effect) waits on two full Subsonic walks on the DJ Mac: `getAlbumList2` alphabetical and `getAlbumList?type=highest`. The whole album array is one device-socket RPC, then held on the API process for the life of the process. A large library delays that shop and loads Navidrome while the show is playing. `resolvePick` only needs id, name, artist, and year. |
| F2 | P2 | Near | Every sleeve batch repeats that walk | `PluginCatalogAPI.getLocalAlbumArtwork` calls `listLibraryAlbums` per batch; `scheduleAlbumArtworkHydrate` batches 24 | Album-catalog rooms re-fetch the full list (now including the ratings walk added on this branch) once per 24 missing sleeves. Navidrome and the device socket do the same crawl many times at room start. No daemon memo. |

## Fix plan (opt-out)

Each item is independent unless **Depends** says otherwise. Default: P1 included. P2 is defer-friendly.

### P1 — Resolve local picks without a full library crawl
**Status:** completed
- **Addresses:** F1
- **When:** Now
- **Depends:** none
- **Files:** `packages/plugin-item-shops/localLibrary/index.ts` (`libraryAlbums`, `registerPicks`), `packages/plugin-item-shops/localLibrary/pickedRecords.ts` (`resolvePick`), a single-album and search path on `PluginCatalogAPI` / the local driver if one does not already exist
- **Change:** Keep ADR 0224's order: id first, then normalized artist + title, preferring a matching year. Resolve a local pick with one `getAlbum` by id, and on a miss run a Subsonic search and apply `normalizeAlbumText` / year choice to those hits. Do not call `listLibraryAlbums` from `registerPicks`. If search returns nothing, fall back to the cached full list from P2 once, so a search miss can still match.
- **Done means:** Opening a trip shop whose picks are local does not call `listLibraryAlbums` on the success path. A pick with a remaster suffix, a leading "The", or a year still resolves the same album as today when that album is in the search hits or the fallback list. Existing `resolvePick` tests cover the match rules.
- **Risk:** Navidrome search tokenization can miss an album the full scan would find. The fallback exists for that miss; it must not run once per pick.

### P2 — Cache listLibraryAlbums on the daemon
**Status:** completed
- **Addresses:** F2
- **When:** Near
- **Depends:** none (P1's fallback is cheaper if this lands first)
- **Files:** `apps/bridge-daemon/src/drivers/local.ts` (`listLibraryAlbums`, `fetchRatedAlbumUserRatings`)
- **Change:** Memoize the combined album list on `LocalDriver` for a few minutes (and drop it on library invalidate). Sleeve batches and album-catalog refresh then share one alphabetical walk and one `highest` walk. Do not cap the list: genre bins and rarity need the full catalog ([ADR 0222](docs/adrs/0222-physical-media-carry.md), [ADR 0111](docs/adrs/0111-physical-media-rarity-signals.md)).
- **Done means:** A hydrate of many batches logs one pair of Subsonic walks per TTL window, not one pair per 24 albums. Invalidating the local library cache clears the memo.
- **Risk:** A library edit on the DJ Mac is invisible until the TTL or an invalidate. A few minutes matches how rarely the catalog is curated during a show.

## Measurement / validation notes

- On a bridge room, time the first trip record-shop open that has a local pick. The device socket should not carry a full `listLibraryAlbums` result on that path.
- With album derivation on, count `getAlbumList2` and `getAlbumList?type=highest` requests during sleeve hydrate. Expect one of each per TTL, not per batch.
- No load test. Both fixes are structural.

## Explicit non-actions

- The trip does not tick. `RoadTripPlugin` re-arms durable schedules and publishes on mutation ([ADR 0213](docs/adrs/0213-road-trips-v1.md)). The van mile on the strip uses the shared 1 Hz ticker and does not emit (`useInterpolatedVanMile`). A 1 Hz strip render is the point of that hook.
- `buildPayload` `LRANGE`s the trip log (capped at 3,000) and then drops every entry except incident steps and part installs. Entries are small, publishes are threshold-driven, and the client array stays short. A second list is not worth it at this size.
- `recordsCoveringTrack` calls `getAlbumTrackIds` once per held picked album on a restricted non-local queue add. Non-local listings are Redis-cached for an hour with in-process single-flight (`fetchSourceAlbumTracks`). Stopping at the first hit would wear the wrong copy when two albums contain the track. An extra process cache would not show up under a handful of records.
- `collectShares` already reads and debits payers concurrently ([ADR 0217](docs/adrs/0217-trip-funds-escrow-pool-and-levy.md)). One gas stop is one burst, not a per-chat loop.
- Voicemail audio is S3 plus a presigned URL. Redis holds the upload session with a TTL ([ADR 0186](docs/adrs/0186-redis-coordination-s3-media.md), [ADR 0212](docs/adrs/0212-show-voicemail.md)). The deck polls `getPlayback` once a second only while the bridge owns that message, because URL players publish no transport events. One admin.
- `three` still loads on viewer mount, not in the room bundle ([ADR 0218](docs/adrs/0218-shared-model-viewer-and-studio-site-assets.md)).
- The record-bin matcher and the 8-genre cap already landed (`37435779`). Not reopened.
- Game Studio's 2,000-album cap and its extra `highest` walk are designer-local ([ADR 0230](docs/adrs/0230-studio-navidrome-snapshot.md)). They do not run during a show.
- User pause is one Redis key with a TTL on the pause path ([ADR 0211](docs/adrs/0211-user-pause-and-play-start-hold.md)). Skipper's own-track check is a single id compare.

## Opt-out checklist

Reply with decisions (keep is default for P1):

- [x] P1 — keep
- [x] P2 — keep

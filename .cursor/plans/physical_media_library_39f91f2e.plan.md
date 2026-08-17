# Physical Media & Personal Libraries

Introduce **Physical Media** (records, CDs, cassettes, 45s) as durable, collectible items in the Item Shops plugin. Each corresponds to a Navidrome playlist. Owning one grants unlimited queueing from its contents for the game session, and users browse their holdings through a new "Physical Media" root in the Add to Queue modal. **Library Card** becomes a separate consumable granting one-track access to the whole local library. **Thrift Store** is renamed **Record Store**.

## Goal

Turn local-library access from a flat grant list into a collectible personal library, while keeping the code organized so the whole feature can be extracted into its own plugin later without a data migration.

---

## Decisions taken

| Decision           | Choice                                                                                                                       | Rationale                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Plugin boundary    | Keep in `plugin-item-shops`, structured as an extraction-ready `localLibrary/` submodule                                     | A separate plugin cannot join the shared shopping rotation without a core refactor of shopping sessions (state is plugin-namespaced)       |
| Item derivation    | Hybrid: derive from prefix-named Navidrome playlists (`[CD]`, `[LP]`, `[TAPE]`, `[45]`)                                      | Avoids per-room manual setup; prefix opt-in avoids exposing every playlist                                                                 |
| Config model       | Pure overrides — a per-playlist override table, no full item definitions in config                                           | Derived values are the source of truth; config only adjusts price/rarity/name/icon                                                         |
| Inventory capacity | Dual slot pools: `inventory` (consumables) and `collection` (durables), via `ItemDefinition.slotPool` + `maxCollectionSlots` | 3 inventory slots is far too tight for collecting; keeps records as `InventoryItem`s so existing transfer and grant resolution still apply |
| Durability         | Session-scoped — Physical Media is stripped on `GAME_SESSION_ENDED` like all other Item Shops items                          | Consistent with the coin economy; keeps future plugin extraction migration-free                                                            |
| Redemption         | `redemption: "durable" \| "perQueue"` on `LocalLibraryGrant`                                                                 | Records grant unlimited queueing; Library Card is consumed per queue                                                                       |
| Shop offers        | `pickWeightedDistinctShortIds` for Record Store; buying an already-owned item is allowed                                     | No duplicate offers within a visit; owned-item purchase merges via `stackable: true` and supports future gifting                           |
| Empty Record Store | Omit the shop from the effective catalog when no records derive                                                              | An empty shop in rotation is worse UX than no shop                                                                                         |
| Item trading       | **Out of scope.** Transfers do not exist yet and will be built separately                                                    | Explicit user instruction                                                                                                                  |
| Playlist freshness | Long TTL (~10 min) + wire the existing `invalidate()` to bridge reconnect and an admin refresh action                        | Derived record playlists are product definitions, effectively immutable mid-session                                                        |
| Commits            | One branch, four commits                                                                                                     | Explicit user instruction                                                                                                                  |

---

## Commit plan

1. **Pre-existing fixes** (independent of the feature): unscoped track search, playlist cache freshness, cover-art fetch cost.
2. **Foundations**: `localLibrary/` submodule extraction, dual slot pools, admin slot UI, redemption modes.
3. **Physical Media**: derivation from Navidrome, Library Card shop, Record Store rename, daemon playlist-tracks RPC.
4. **Surfaces & docs**: server shelves, web "Physical Media" tab, ADRs, tests, Studio Bridge parity.

---

## Commit 1 — Pre-existing fixes

### Step 1.1 — Fix unscoped track search

`packages/server/operations/dj/searchTracks.ts` correctly computes `playlistIds` from the caller's grants and passes them down, but the adapter layer drops the third argument, so **playlist-scoped users currently get unfiltered search results**.

- In `packages/server/handlers/djHandlersAdapter.ts` (~line 484), forward the `options` argument to `this.djService.searchForTrack`.
- Add a regression test asserting a scoped user's results are filtered.

This is a live access-control bug and should land first, on its own.

### Step 1.2 — Playlist membership freshness

`apps/bridge-daemon/src/drivers/localPlaylistCache.ts` caches per-playlist membership with a 45-second TTL. That TTL assumes playlists are an operator-managed surface edited mid-session. Derived Physical Media inverts the assumption: a `[CD] Loveless` playlist is a product definition, stable for the whole session. At 45s, a 20-record collection goes fully cold every 45 seconds.

- Raise `PLAYLIST_CACHE_TTL_MS` to ~10 minutes.
- Wire the already-present `PlaylistMembershipCache.invalidate()` (currently never called outside tests) to:
  - bridge daemon reconnect, and
  - a new admin "refresh local library" action, so editing Navidrome has an immediate, deliberate path to visibility rather than relying on a short TTL.
- Memoize the `getUnion` result keyed by the sorted playlist-id set plus max `fetchedAt`, so repeated browse requests for the same collection skip re-unioning.
- Bound the cache: it is currently an unbounded `Map` with no eviction, and expired entries are never removed. Add a max-entry LRU.

Note that `getUnion` already uses `Promise.all`, so browsing a large collection costs one round-trip of latency, not N. But `playlistsContainingTrack` awaits sequentially in a `for` loop with no short-circuit, and it sits on the critical path of adding a track to the queue. Parallelize it, and stop early when the caller only needs one match. **This is the real `maxCollectionSlots` bound.**

### Step 1.3 — Cover art fetch cost

In `apps/bridge-daemon/src/drivers/local.ts`, `mapSong` calls `fetchCoverDataUri(songId)` per track, fetching the image and base64-encoding it into a data URI. It is called in **sequential** `for` loops in both `search` (up to 20 results) and `getAlbum` (every track). Nothing caches it.

Browse paths are fine — they use `coverArtUrlFn()` and only build URLs. Track paths pay a full image fetch each.

- Key a cover cache by **album/coverArt id rather than song id**. Every track on a record shares one cover, so a 12-track record collapses from 12 fetches to 1. This is the largest single win.
- Parallelize the per-track mapping with a small concurrency cap instead of sequential awaits.
- Cache the resulting data URIs in a bounded LRU (they are large, so the bound matters more than for membership).

Also worth measuring: data URIs travel daemon → Redis RPC → server → Socket.IO to the client, so a 20-result search carries roughly 20 base64 images in one payload. Shelf views listing full tracklists will exercise this harder than search does. If payload size proves to be the binding constraint rather than fetch latency, the fix is a server-proxied cover endpoint, not a bigger cache — flagged as an open question rather than planned work.

### Guardrail (no code change)

The ADR 0086 metadata search cache key is `metadata:search:v1:{sourceId}:{encodeURIComponent(query)}` — **no user or playlist component**. Local search does not currently use it. Opting local into that cache without adding the playlist scope to the key would leak one user's playlist-filtered results to another. Record this explicitly in ADR 0099 so a later change does not walk into it.

---

## Commit 2 — Foundations

### Step 2.1 — Carve out an extraction-ready `localLibrary/` module

Create `packages/plugin-item-shops/localLibrary/` with `grants.ts`, `catalog.ts`, `config.ts`, and an `index.ts` exposing a plugin-shaped `LocalLibraryModule` interface. `ItemShopsPlugin` delegates its three hooks to the module. Mechanical move, no behavior change, tests stay green.

### Step 2.2 — Dual inventory slot pools

Add `slotPool: "inventory" | "collection"` to `ItemDefinition` (defaulting to `inventory`) and `maxCollectionSlots` alongside `maxInventorySlots`. `InventoryService.canAccommodateItem` checks against the item's own pool. `InventoryTab` renders the two pools separately.

### Step 2.3 — Admin UI for slot configuration

`maxInventorySlots` is currently only settable programmatically or via scheduler presets, not through the admin web UI — which makes `maxCollectionSlots` untestable in playtesting. Expose both on the Start Game Session form.

### Step 2.4 — Redemption modes

Add `redemption: "durable" | "perQueue"` to `LocalLibraryGrant`. Durable grants permit queueing without consuming; `pickGrantToConsume` only ever returns `perQueue` grants. Migrate existing config rows.

---

## Commit 3 — Physical Media

### Step 3.1 — Derive items from Navidrome

Derive Physical Media from `[CD]` / `[LP]` / `[TAPE]` / `[45]` prefixed playlists via `api.listLocalPlaylists`. `shortId` is `pm-<playlistId>`; price and rarity come from `songCount`. Add a per-playlist override config table. Rebuild on `register` and on `MEDIA_BRIDGE_STATUS_CHANGED`.

### Step 3.2 — Library Card shop

Make Library Card a static item module and add a bridge-gated **Public Library** shop to `SHOP_CATALOG`. Remove `library-card` from `DEFAULT_LOCAL_LIBRARY_GRANTS` so the Record Store carries only Physical Media.

### Step 3.3 — Record Store rename

Rename Thrift Store to Record Store and move the shop definitions into the module. Compute the default `enabledShopIds` from the **effective** catalog rather than the static `SHOP_CATALOG` snapshot, so dynamically contributed shops are not excluded in new rooms. Note the migration consequence: existing rooms lose the shop from rotation until re-enabled.

### Step 3.4 — Daemon playlist track listing

Retain full tracks in the `PlaylistMembership` cache and add a `listPlaylistTracks` RPC (protocol enum, `rpcServer` dispatch, `localMetadata` wrapper).

---

## Commit 4 — Surfaces & docs

### Step 4.1 — Server shelves

Expose `myMedia` shelves on the effective-metadata-sources payload for `local`, and add a `BROWSE_MEDIA_ITEM` handler that resolves `mediaKey` to a playlist id **from the caller's own held grants** — never trust a client-supplied playlist id.

### Step 4.2 — Web "Physical Media" root

Add a third root tab to `CatalogBrowse` (`RootKind` `media`), wire `BROWSE_MEDIA_ITEM` into `catalogBrowseMachine`, and thread `myMedia` through `effectiveMetadataSourcesMachine` plus a `useMyMedia` hook.

### Step 4.3 — ADRs, tests, Studio Bridge

Write ADR 0099 (Physical Media; partially supersedes ADR 0098 §7, and records the cache-key guardrail) and ADR 0100 (dual inventory slot pools). Rewrite the two grant test files. Mirror new events in `studio-bridge` and `BridgeSnapshot`.

---

## Commit 5 — Post-review follow-ups (done)

### Step 5.1 — Collection area only when stocked

Render the game-state Collection area only once the user holds a collection item, and drop the empty-slot placeholders there (recorded in ADR 0100 §4).

### Step 5.2 — Playlist artwork instead of icons

Add a `getPlaylistCoverArt` daemon RPC, re-host the returned data URIs in the room image store from `PluginAPI.getLocalPlaylistArtwork`, and carry the resulting url on `ItemDefinition.imageUrl` / `ShopOffer.imageUrl` / `MyMediaShelf.imageUrl`. A shared `ItemArtwork` component prefers artwork and falls back to the Lucide icon (ADR 0099 §8).

### Step 5.3 — Deep-link from a held record into Browse

Give Physical Media rows a "Queue a track" action that opens Add to Queue → Browse → Physical Media on that shelf, via `EDIT_QUEUE.browseMediaKey` on `modalsMachine` (ADR 0099 §10).

### Step 5.4 — Stop reporting bridge failures as empty records

`fetchLocalPlaylistTracks` returns a result variant so `browseMediaItem` can fail loudly when the daemon does not answer, instead of rendering "No tracks found" (ADR 0099 §9). This was the cause of the always-empty shelf: an older daemon build answered nothing and the timeout was swallowed.

---

## Optional / deferred

- **Album-backed grants**: thread `albumIds` through `MetadataSource` option bags, `localMetadata`, `rpcServer`, and an album-membership path in `localPlaylistCache`; generalize `checkPlaylistMembership`. Only if playlists prove too coarse.
- **Item trading**: `TRANSFER_INVENTORY_ITEM` event, Transfer button in `InventoryTab`, admin `allowTrading` toggle, chat notice on transfer. Explicitly deferred to separate work.

---

## Open risks

- **Record Store rename is a breaking config change.** Rooms with `thrift-store` in `enabledShopIds` silently lose it. Acceptable pre-launch; needs a note if any live room configs exist.
- **Session-scoped durability may disappoint.** "Collect records" reads as permanent to players, but they vanish at `GAME_SESSION_ENDED`. Worth an explicit UI affordance so the loss is not a surprise.
- **Prefix convention is unvalidated by anything.** A typo'd `[CD]` prefix silently yields no item. Consider surfacing derived-item count in the admin UI.
- **Cover art payload size** — addressed for playlist art by re-hosting it in the room image store (ADR 0099 §8); track/album art in browse results is still adapter-supplied and unmeasured.
- **Playlist cache is daemon-global, not room-scoped.** Correct today because playlist contents are user-independent, but any future per-user playlist view would break the sharing assumption.

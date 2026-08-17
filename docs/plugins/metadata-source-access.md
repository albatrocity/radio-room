# Metadata Source Access

On Media Bridge rooms, each enabled metadata service can be **open** (anyone who can Add to Queue) or **restricted** (room admins plus plugin grants). See [ADR 0088](../adrs/0088-metadata-source-access-grants.md).

This is separate from:

- **Availability** ([ADR 0087](../adrs/0087-room-bridge-media-source-policy.md)): `metadataSourceIds` ∩ bridge CAPABILITIES
- **Personas** ([ADR 0057](../adrs/0057-user-personas-system.md)): identity labels only — not privileges in core

## Discovering services

Do not hardcode source ids as the only discovery path. Query the room catalog:

```typescript
const sources = await this.context!.api.listMetadataSources(this.context!.roomId)
// [{ id: "spotify", label: "Spotify" }, { id: "youtube", label: "YouTube" }, ...]
```

Use returned `id` values in config schemas (admin picks a service) and in grant checks.

## Querying access (read-only)

Plugins can evaluate the same ADR 0088 rules the server uses for search/queue without reimplementing open/restricted + grants:

```typescript
const roomId = this.context!.roomId
const userId = someUserId

const canSearchYoutube = await this.context!.api.canAccessMetadataSource({
  roomId,
  userId,
  sourceId: "youtube",
  action: "search",
})

const searchableIds = await this.context!.api.getEffectiveMetadataSourceIds(
  roomId,
  userId,
  "search",
)
```

Use these for plugin UI, recipes, or side effects that depend on what the user can already reach. Prefer grants (`grantMetadataSourceAccess`) to *unlock* restricted sources; use these helpers to *observe* effective access.

## Granting access

Implement `grantMetadataSourceAccess` on your plugin:

```typescript
async grantMetadataSourceAccess(params: {
  roomId: string
  userId: string
  sourceId: string
  action: "search" | "queue"
}): Promise<"grant" | "abstain"> {
  // Return "grant" to unlock a restricted source for this user/action.
  // Return "abstain" if this plugin does not apply.
  return "abstain"
}
```

**Semantics (fail-closed for grants):**

| Plugin behavior | Result |
| --------------- | ------ |
| Returns `"grant"` | Access allowed (any grant wins) |
| Returns `"abstain"` | No grant from this plugin |
| Throws / times out | Treated as abstain |
| Not implemented | Skipped |

Room admins always bypass restrictions. Open sources never need grants.

Access is evaluated **before** [`validateQueueRequest`](queue-validation.md). Queue validation still runs afterward and receives `mediaSourceType`.

## Recipe: persona unlocks YouTube

Personas stay labels; your plugin owns the privilege:

```typescript
async onRoomReady() {
  await this.personas.registerPersonas([
    {
      id: "youtube-access", // becomes plugin:{name}:youtube-access
      label: "YouTube Access",
      assignableByAdmin: true,
      decoratesUser: true,
    },
  ])
}

async grantMetadataSourceAccess(params) {
  const config = await this.getConfig()
  const sourceId = config?.sourceId // set via admin config from listMetadataSources()
  if (params.sourceId !== sourceId) return "abstain"

  const personas = await this.personas.getUserPersonas(params.roomId, params.userId)
  const mine = `plugin:${this.name}:youtube-access`
  return personas.some((p) => p.personaId === mine) ? "grant" : "abstain"
}
```

## Recipe: one-shot local library queue

1. Configure Item Shops **Local library grants** (full-library and/or playlist shelves — [ADR 0098](../adrs/0098-inventory-scoped-local-library-catalog-filters.md)). Bind Navidrome playlists via the admin playlist picker when the Media Bridge is connected.
2. `grantMetadataSourceAccess`: if the user holds a **resolved** grant (full library or mapped playlist id) and `sourceId` is `local` → `"grant"` for `search` and `queue`.
3. Optional `resolveLocalLibraryCatalogFilter`: return `{ mode: "unrestricted" }` or `{ mode: "playlists", playlistIds }` so Local search/browse RPC can filter without exposing playlists in the client.
4. `validateQueueRequest`: when `params.mediaSourceType` is `local` and Local is restricted, consume the preferred grant (shelf if the track is in that playlist, else full-library). Prefer consuming only after access would allow the request.

```typescript
async validateQueueRequest(params: QueueValidationParams) {
  if (params.mediaSourceType !== "local") return allowQueueRequest()
  // Resolve held grants → checkLocalTrackPlaylistMembership → pickGrantToConsume → removeItem
  return allowQueueRequest()
}
```

(Adjust so you only decrement when the user actually needed the grant; e.g. check restricted mode via room settings if needed.)

## Room admin UI

Admins set **Admins + plugin grants only** per enabled source under Content → Media sources (bridge playback controller). That writes `metadataSourceAccess` on the room.

For playlist shelves, use Item Shops → Local library grants (`object-array`). Playlist rows use a `remote-select` fed by `LIST_BRIDGE_LOCAL_PLAYLISTS`. See ADR 0098 ops runbook.

## Catalog browse

Optional `MetadataSourceApi` methods `listArtists` / `getArtist` / `getAlbum` (and optional `listAlbums` / `getBrowseCapabilities`) power Add to Queue **Browse** and Search artist/album rows that deep-link into Browse ([ADR 0089](../adrs/0089-metadata-source-content-browse.md), [ADR 0090](../adrs/0090-hybrid-metadata-catalog-browse.md)).

- Browse is gated by the same **`search`** action as text search—no separate grant.
- Clients learn browseability via `browseableSourceIds` and `browseSourceCapabilities` on `EFFECTIVE_METADATA_SOURCES` / INIT.
- **Local** uses index-entry browse; **Spotify** uses search-entry browse. Text Search may return additive `artists` / `albums` on `TRACK_SEARCH_RESULTS`.
- Playlist-scoped grants still use artists → albums → tracks; playlists are never a client browse mode ([ADR 0098](../adrs/0098-inventory-scoped-local-library-catalog-filters.md)).

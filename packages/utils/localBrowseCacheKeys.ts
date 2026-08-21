/**
 * Redis key builders for Local CatalogBrowse album / playlist track caches (ADR 0108).
 * Scope is playlist/album membership, never a user id (ADR 0099 §7).
 */

/** 10 minutes — aligned with daemon playlist/cover TTLs. */
export const LOCAL_BROWSE_CACHE_TTL_SEC = 10 * 60

function sortedUniqueIds(ids?: string[]): string[] {
  if (!ids?.length) return []
  return Array.from(new Set(ids.map((p) => p.trim()).filter(Boolean))).sort()
}

/**
 * `library` when unrestricted.
 * Playlist-only keeps the historical comma-joined id list (cache key stability).
 * Album-only / mixed scopes use an explicit prefix so they never collide with playlist ids.
 */
export function browsePlaylistScope(playlistIds?: string[], albumIds?: string[]): string {
  const playlists = sortedUniqueIds(playlistIds)
  const albums = sortedUniqueIds(albumIds)
  if (playlists.length === 0 && albums.length === 0) return "library"
  if (albums.length === 0) return playlists.join(",")
  if (playlists.length === 0) return `albums:${albums.join(",")}`
  return `pl:${playlists.join(",")}|al:${albums.join(",")}`
}

export function metadataBrowseAlbumCacheKey(
  roomId: string,
  albumId: string,
  playlistIds?: string[],
  albumIds?: string[],
): string {
  return `metadata:browse:v1:${roomId}:album:${albumId}:${browsePlaylistScope(playlistIds, albumIds)}`
}

export function metadataBrowsePlaylistCacheKey(roomId: string, playlistId: string): string {
  return `metadata:browse:v1:${roomId}:playlist:${playlistId.trim()}`
}

/** Prefix deleted on `refreshLocalLibrary` / `invalidateLocalLibraryCache`. */
export function metadataBrowseRoomPrefix(roomId: string): string {
  return `metadata:browse:v1:${roomId}:`
}

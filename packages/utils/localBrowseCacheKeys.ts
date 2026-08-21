/**
 * Redis key builders for Local CatalogBrowse album / playlist track caches (ADR 0108).
 * Scope is playlist membership, never a user id (ADR 0099 §7).
 */

/** 10 minutes — aligned with daemon playlist/cover TTLs. */
export const LOCAL_BROWSE_CACHE_TTL_SEC = 10 * 60

/** `library` when unrestricted; otherwise sorted unique playlist ids. */
export function browsePlaylistScope(playlistIds?: string[]): string {
  if (!playlistIds?.length) return "library"
  const unique = [...new Set(playlistIds.map((p) => p.trim()).filter(Boolean))].sort()
  return unique.length > 0 ? unique.join(",") : "library"
}

export function metadataBrowseAlbumCacheKey(
  roomId: string,
  albumId: string,
  playlistIds?: string[],
): string {
  return `metadata:browse:v1:${roomId}:album:${albumId}:${browsePlaylistScope(playlistIds)}`
}

export function metadataBrowsePlaylistCacheKey(roomId: string, playlistId: string): string {
  return `metadata:browse:v1:${roomId}:playlist:${playlistId.trim()}`
}

/** Prefix deleted on `refreshLocalLibrary` / `invalidateLocalLibraryCache`. */
export function metadataBrowseRoomPrefix(roomId: string): string {
  return `metadata:browse:v1:${roomId}:`
}

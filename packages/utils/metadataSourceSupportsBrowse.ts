import type { MetadataSourceApi } from "@repo/types"

/**
 * A metadata source supports catalog browse when all three optional methods are present.
 * See ADR 0089 / 0090. listAlbums is additive and not required for browseability.
 */
export function metadataSourceSupportsBrowse(
  api: Pick<MetadataSourceApi, "listArtists" | "getArtist" | "getAlbum">,
): boolean {
  return (
    typeof api.listArtists === "function" &&
    typeof api.getArtist === "function" &&
    typeof api.getAlbum === "function"
  )
}

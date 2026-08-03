import type { MetadataBrowseCapabilities, MetadataSourceApi } from "@repo/types"

/**
 * Resolve browse UI capabilities for a metadata source API (ADR 0090).
 * Defaults: index entry; albumSearch when listAlbums is present.
 */
export function resolveBrowseCapabilities(
  api: Pick<MetadataSourceApi, "listAlbums" | "getBrowseCapabilities">,
): MetadataBrowseCapabilities {
  if (typeof api.getBrowseCapabilities === "function") {
    return api.getBrowseCapabilities()
  }
  return {
    entryMode: "index",
    albumSearch: typeof api.listAlbums === "function",
  }
}

import { z } from "zod"

export const metadataSourceAccessActionSchema = z.enum(["search", "queue"])
export type MetadataSourceAccessAction = z.infer<typeof metadataSourceAccessActionSchema>

export const metadataSourceAccessModeSchema = z.enum(["open", "restricted"])
export type MetadataSourceAccessMode = z.infer<typeof metadataSourceAccessModeSchema>

export const metadataSourceCatalogEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
})
export type MetadataSourceCatalogEntry = z.infer<typeof metadataSourceCatalogEntrySchema>

export const metadataSourceAccessGrantParamsSchema = z.object({
  roomId: z.string(),
  userId: z.string(),
  sourceId: z.string(),
  action: metadataSourceAccessActionSchema,
})
export type MetadataSourceAccessGrantParams = z.infer<
  typeof metadataSourceAccessGrantParamsSchema
>

export type MetadataSourceAccessGrantResult = "grant" | "abstain"

/**
 * Per-user Local catalog scope from plugin inventory grants (ADR 0098 / 0109).
 * `null` means no plugin contributed a filter (caller should treat as full library
 * when access is already allowed — e.g. admin / open).
 * Scoped shelves may include playlist ids, album ids, or both; either non-empty
 * list is a real filter (album-only must not fall through to unrestricted).
 */
export type LocalLibraryCatalogFilter =
  | { mode: "unrestricted" }
  | { mode: "playlists"; playlistIds: string[]; albumIds: string[] }

export const METADATA_SOURCE_LABELS: Record<string, string> = {
  spotify: "Spotify",
  tidal: "Tidal",
  youtube: "YouTube",
  local: "Library (local)",
  applemusic: "Apple Music",
}

export function labelForMetadataSource(sourceId: string): string {
  if (METADATA_SOURCE_LABELS[sourceId]) return METADATA_SOURCE_LABELS[sourceId]
  if (!sourceId) return sourceId
  return sourceId.charAt(0).toUpperCase() + sourceId.slice(1)
}

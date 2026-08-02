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

export const METADATA_SOURCE_LABELS: Record<string, string> = {
  spotify: "Spotify",
  tidal: "Tidal",
  youtube: "YouTube",
  local: "Library (local)",
  applemusic: "Apple Music",
}

export function labelForMetadataSource(sourceId: string): string {
  return METADATA_SOURCE_LABELS[sourceId] ?? sourceId
}

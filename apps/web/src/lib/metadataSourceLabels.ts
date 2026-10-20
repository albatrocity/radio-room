import { labelForMetadataSource } from "@repo/types"

/**
 * Browse-only source for held records when Local isn't browseable, so a picked
 * Spotify record (ADR 0216) is reachable without Local access. Never sent to
 * the server as a metadata source.
 */
export const RECORDS_BROWSE_SOURCE = "records"

/** Web alias for {@link labelForMetadataSource} (`@repo/types` is the single label map). */
export function metadataSourceLabel(sourceId: string): string {
  if (sourceId === RECORDS_BROWSE_SOURCE) return "My Records"
  return labelForMetadataSource(sourceId)
}

export { labelForMetadataSource }

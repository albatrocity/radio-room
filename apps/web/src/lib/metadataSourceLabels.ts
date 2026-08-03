import { labelForMetadataSource } from "@repo/types"

/** Web alias for {@link labelForMetadataSource} (`@repo/types` is the single label map). */
export function metadataSourceLabel(sourceId: string): string {
  return labelForMetadataSource(sourceId)
}

export { labelForMetadataSource }

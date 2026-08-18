import {
  ITEM_SHOPS_PLUGIN_NAME,
  PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY,
  parseArtworkFrame,
  type ArtworkFrame,
  type PhysicalMediaNowPlayingFrame,
} from "@repo/types"

type ItemShopsNowPlayingData = {
  [PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY]?: unknown
}

export type PhysicalMediaArt = {
  artworkFrame: ArtworkFrame
  /** Row-sized cover (~384px), or the track's own art when the record has no cover. */
  imageUrl: string
  /** Feature-sized cover (~1200px); absent for track-art fallback or a stale daemon. */
  imageUrlLarge?: string
  /** Track art, set only when it differs from the sleeve, for FramedArtwork onError. */
  fallbackImageUrl?: string
}

function readFrame(value: unknown): PhysicalMediaNowPlayingFrame | undefined {
  if (value == null || typeof value !== "object") return undefined
  const record = value as {
    imageUrl?: unknown
    imageUrlLarge?: unknown
    artworkFrame?: unknown
  }
  if (typeof record.artworkFrame !== "string") return undefined
  const artworkFrame = parseArtworkFrame(record.artworkFrame)
  if (!artworkFrame) return undefined
  const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : ""
  const imageUrlLarge =
    typeof record.imageUrlLarge === "string" ? record.imageUrlLarge.trim() : ""
  return {
    artworkFrame,
    ...(imageUrl ? { imageUrl } : {}),
    ...(imageUrlLarge ? { imageUrlLarge } : {}),
  }
}

function readNowPlayingFrame(
  pluginData: Record<string, unknown> | undefined,
  pluginConfigs: Record<string, Record<string, unknown>> | undefined,
): PhysicalMediaNowPlayingFrame | undefined {
  const config = pluginConfigs?.[ITEM_SHOPS_PLUGIN_NAME]
  if (config?.enabled !== true) return undefined
  if (config?.showPhysicalMediaFrameInNowPlaying !== true) return undefined

  const data = pluginData?.[ITEM_SHOPS_PLUGIN_NAME] as ItemShopsNowPlayingData | undefined
  return readFrame(data?.[PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY])
}

/**
 * Sleeve/case to show when Item Shops is enabled and the operator opted into
 * Physical Media frames for Local tracks that live on a derived record.
 * Returns undefined when the unframed artwork path should be used.
 */
export function resolvePhysicalMediaArt(params: {
  pluginData: Record<string, unknown> | undefined
  pluginConfigs: Record<string, Record<string, unknown>> | undefined
  trackArtUrl?: string
  /** Room artwork override or obscured artwork. */
  disabled?: boolean
}): PhysicalMediaArt | undefined {
  if (params.disabled) return undefined
  const frame = readNowPlayingFrame(params.pluginData, params.pluginConfigs)
  if (!frame) return undefined

  const trackUrl = params.trackArtUrl?.trim() || ""
  const sleeveUrl = frame.imageUrl?.trim() || frame.imageUrlLarge?.trim() || ""
  const imageUrl = sleeveUrl || trackUrl
  if (!imageUrl) return undefined
  const imageUrlLarge = frame.imageUrlLarge?.trim() || undefined
  return {
    artworkFrame: frame.artworkFrame,
    imageUrl,
    ...(imageUrlLarge ? { imageUrlLarge } : {}),
    ...(sleeveUrl && trackUrl && sleeveUrl !== trackUrl ? { fallbackImageUrl: trackUrl } : {}),
  }
}

/**
 * Adapter for shop/collection/browse payloads that already carry `imageUrl` +
 * `artworkFrame` (both required). Does not apply the Now Playing config gate.
 */
export function toPhysicalMediaArt(source: {
  imageUrl?: string
  imageUrlLarge?: string
  artworkFrame?: ArtworkFrame | string
}): PhysicalMediaArt | undefined {
  const imageUrl = source.imageUrl?.trim()
  const artworkFrame =
    typeof source.artworkFrame === "string" ? parseArtworkFrame(source.artworkFrame) : undefined
  if (!imageUrl || !artworkFrame) return undefined
  const imageUrlLarge = source.imageUrlLarge?.trim()
  return {
    artworkFrame,
    imageUrl,
    ...(imageUrlLarge ? { imageUrlLarge } : {}),
  }
}

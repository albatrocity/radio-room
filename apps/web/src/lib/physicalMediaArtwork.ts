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
  imageUrl?: string
  /** Feature-sized cover (~1200px); absent for track-art fallback or a stale daemon. */
  imageUrlLarge?: string
  /** Track art, set only when it differs from the sleeve, for FramedArtwork onError. */
  fallbackImageUrl?: string
  /** Hand-lettered title on a coverless jewel-case disc. */
  discLabel?: string
}

/** Strip the derived `CD: ` prefix from default item names; operator overrides pass through. */
export function deriveDiscLabel(name?: string): string | undefined {
  const trimmed = name?.trim()
  if (!trimmed) return undefined
  const stripped = trimmed.replace(/^CD:\s+/i, "").trim()
  return stripped || trimmed
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
  const imageUrlLarge = typeof record.imageUrlLarge === "string" ? record.imageUrlLarge.trim() : ""
  return {
    artworkFrame,
    ...(imageUrl ? { imageUrl } : {}),
    ...(imageUrlLarge ? { imageUrlLarge } : {}),
  }
}

/**
 * Whether the operator opted Local tracks into sleeve/case artwork.
 *
 * Kept as a standalone predicate so rows can subscribe to this one boolean
 * instead of the whole plugin config record (which would re-render every
 * playlist row whenever any unrelated plugin's config changed).
 */
export function physicalMediaFramesEnabled(
  pluginConfigs: Record<string, Record<string, unknown>> | undefined,
): boolean {
  const config = pluginConfigs?.[ITEM_SHOPS_PLUGIN_NAME]
  return config?.enabled === true && config?.showPhysicalMediaFrameInNowPlaying === true
}

function readNowPlayingFrame(
  pluginData: Record<string, unknown> | undefined,
): PhysicalMediaNowPlayingFrame | undefined {
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
  /** Result of `physicalMediaFramesEnabled` for the room. */
  framesEnabled: boolean
  trackArtUrl?: string
  /** Room artwork override or obscured artwork. */
  disabled?: boolean
}): PhysicalMediaArt | undefined {
  if (params.disabled || !params.framesEnabled) return undefined
  const frame = readNowPlayingFrame(params.pluginData)
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
 * Adapter for shop/collection/browse payloads that carry `artworkFrame` and
 * optionally `imageUrl`. Coverless jewel cases with a `name` get a hand-lettered
 * disc instead. Does not apply the Now Playing config gate.
 */
export function toPhysicalMediaArt(source: {
  imageUrl?: string
  imageUrlLarge?: string
  artworkFrame?: ArtworkFrame | string
  name?: string
}): PhysicalMediaArt | undefined {
  const artworkFrame =
    typeof source.artworkFrame === "string" ? parseArtworkFrame(source.artworkFrame) : undefined
  if (!artworkFrame) return undefined

  const imageUrl = source.imageUrl?.trim()
  const imageUrlLarge = source.imageUrlLarge?.trim()

  if (imageUrl) {
    return {
      artworkFrame,
      imageUrl,
      ...(imageUrlLarge ? { imageUrlLarge } : {}),
    }
  }

  if (artworkFrame === "jewel-case") {
    const discLabel = deriveDiscLabel(source.name)
    if (discLabel) return { artworkFrame, discLabel }
  }

  return undefined
}

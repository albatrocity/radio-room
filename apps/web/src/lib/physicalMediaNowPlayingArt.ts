import {
  ITEM_SHOPS_PLUGIN_NAME,
  PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY,
  parseArtworkFrame,
  type PhysicalMediaNowPlayingFrame,
} from "@repo/types"

type ItemShopsNowPlayingData = {
  [PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY]?: unknown
}

function readFrame(value: unknown): PhysicalMediaNowPlayingFrame | undefined {
  if (value == null || typeof value !== "object") return undefined
  const record = value as { imageUrl?: unknown; artworkFrame?: unknown }
  if (typeof record.artworkFrame !== "string") return undefined
  const artworkFrame = parseArtworkFrame(record.artworkFrame)
  if (!artworkFrame) return undefined
  const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl.trim() : ""
  return imageUrl ? { imageUrl, artworkFrame } : { artworkFrame }
}

/**
 * Sleeve/case to show in Now Playing when Item Shops is enabled and the operator
 * opted into Physical Media frames for Local tracks that live on a derived record.
 */
export function physicalMediaNowPlayingFrame(
  pluginData: Record<string, unknown> | undefined,
  pluginConfigs: Record<string, Record<string, unknown>> | undefined,
): PhysicalMediaNowPlayingFrame | undefined {
  const config = pluginConfigs?.[ITEM_SHOPS_PLUGIN_NAME]
  if (config?.enabled !== true) return undefined
  if (config?.showPhysicalMediaFrameInNowPlaying !== true) return undefined

  const data = pluginData?.[ITEM_SHOPS_PLUGIN_NAME] as ItemShopsNowPlayingData | undefined
  return readFrame(data?.[PHYSICAL_MEDIA_NOW_PLAYING_FRAME_KEY])
}

import type { ItemUseHandler } from "./types"
import { formatPhysicalMediaList } from "@repo/types"

export {
  PLAYBACK_DEVICE_SELLBACK_RATE,
  playbackDeviceSellbackValue,
} from "./playbackDeviceSellback"

/** Devices are held, never activated — mirrors `usePassiveDefenseItem`. */
export const usePlaybackDevice: ItemUseHandler = async (_deps, _userId, definition) => {
  const plays = formatPhysicalMediaList(definition.playbackFormats)
  const wearNote = definition.gentlePlayback
    ? " It does not wear Physical Media when you queue from a matching copy."
    : ""
  return {
    success: true,
    consumed: false,
    message: `Keep this in your Playback Devices. It plays ${plays}.${wearNote}`,
  }
}

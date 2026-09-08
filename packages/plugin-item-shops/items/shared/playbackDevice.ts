import type { ItemUseHandler } from "./types"
import type { PhysicalMediaFormat } from "@repo/types"

export {
  PLAYBACK_DEVICE_SELLBACK_RATE,
  playbackDeviceSellbackValue,
} from "./playbackDeviceSellback"

const FORMAT_PLAY_LABEL: Record<PhysicalMediaFormat, string> = {
  CD: "CDs",
  LP: "LPs",
  TAPE: "cassettes",
  "45": "45s",
}

function formatList(formats: PhysicalMediaFormat[] | undefined): string {
  const labels = (formats ?? []).map((f) => FORMAT_PLAY_LABEL[f] ?? f)
  if (labels.length === 0) return "nothing"
  if (labels.length === 1) return labels[0]!
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`
}

/** Devices are held, never activated — mirrors `usePassiveDefenseItem`. */
export const usePlaybackDevice: ItemUseHandler = async (_deps, _userId, definition) => {
  const plays = formatList(definition.playbackFormats)
  const wearNote = definition.gentlePlayback
    ? " It does not wear Physical Media when you queue from a matching copy."
    : ""
  return {
    success: true,
    consumed: false,
    message: `Keep this in your Playback Devices. It plays ${plays}.${wearNote}`,
  }
}

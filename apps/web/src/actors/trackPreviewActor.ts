/**
 * Track Preview Actor
 *
 * Owns HTML5 Howl playback for Local / Physical Media clip previews (ADR 0103).
 * Ducks the radio stream via audioActor without flipping the mute control.
 */

import { createActor } from "xstate"
import { trackPreviewMachine, type TrackPreviewStatus } from "../machines/trackPreviewMachine"
import { unlockPreviewAudio } from "../lib/previewAudioUnlock"

export const trackPreviewActor = createActor(trackPreviewMachine).start()

export function toggleTrackPreview(params: {
  trackKey: string
  trackId: string
  mediaKey?: string
  source?: string
}): void {
  unlockPreviewAudio()
  trackPreviewActor.send({ type: "TOGGLE_PREVIEW", ...params })
}

export function stopTrackPreview(): void {
  trackPreviewActor.send({ type: "STOP_PREVIEW" })
}

export function getActivePreviewTrackKey(): string | null {
  return trackPreviewActor.getSnapshot().context.trackKey
}

export function getTrackPreviewStatusForKey(trackKey: string): TrackPreviewStatus {
  const { trackKey: active, status } = trackPreviewActor.getSnapshot().context
  if (active !== trackKey) return "idle"
  return status
}

export function sendTrackPreviewEvent(
  event: Parameters<typeof trackPreviewActor.send>[0],
): void {
  trackPreviewActor.send(event)
}

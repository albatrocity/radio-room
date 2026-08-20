import { Howl } from "howler"

/** Minimal silent MP3 — plays instantly to retain user-gesture unlock for later async play. */
const SILENT_MP3 =
  "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjQ1AAAAAAAAAAAAAAAAJAYHAAAAAAAAA4T/upwAAAAAAP/zUAAA"

let unlockHowl: Howl | null = null

/**
 * Call synchronously from a click handler before any await/socket round-trip.
 * Browsers block audio.play() after async work without a prior unlock gesture.
 */
export function unlockPreviewAudio(): void {
  try {
    if (!unlockHowl) {
      unlockHowl = new Howl({
        src: [SILENT_MP3],
        html5: true,
        volume: 0,
        format: ["mp3"],
      })
    }
    unlockHowl.stop()
    unlockHowl.play()
  } catch {
    /* best-effort */
  }
}

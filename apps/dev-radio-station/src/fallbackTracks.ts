import type { TrackMeta } from "./icy.js"

/** Deterministic rotating tracks used when no Media Bridge event has arrived yet. */
export const FALLBACK_TRACKS: readonly TrackMeta[] = [
  { title: "Stub Signal", artist: "Dev Radio", album: "Local Testing" },
  { title: "Carrier Wave", artist: "Dev Radio", album: "Local Testing" },
  { title: "Null Tone", artist: "Dev Radio", album: "Local Testing" },
  { title: "Test Pattern", artist: "Dev Radio", album: "Local Testing" },
]

export function fallbackTrackAt(index: number): TrackMeta {
  const i = ((index % FALLBACK_TRACKS.length) + FALLBACK_TRACKS.length) % FALLBACK_TRACKS.length
  return FALLBACK_TRACKS[i]!
}

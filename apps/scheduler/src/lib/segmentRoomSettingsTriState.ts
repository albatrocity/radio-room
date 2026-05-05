import type { SegmentRoomSettingsOverride } from "@repo/types"

export type RoomSettingTriState = "true" | "false" | "unchanged"
export type PlaybackModeTriState = "unchanged" | "spotify-controlled" | "app-controlled"

/** Tri-state for bulk deputy update (stored as `deputyBulkAction` when not unchanged). */
export type DeputyBulkTriState = "unchanged" | "deputize_all" | "dedeputize_all"

const KEYS = [
  "deputizeOnJoin",
  "showQueueCount",
  "showQueueTracks",
  "fetchMeta",
  "announceNowPlaying",
] as const

export type RoomSettingOverrideKey = (typeof KEYS)[number]

export function overrideToTriState(
  override: SegmentRoomSettingsOverride | null | undefined,
  key: RoomSettingOverrideKey,
): RoomSettingTriState {
  if (!override || override[key] === undefined) return "unchanged"
  return override[key] ? "true" : "false"
}

export function overrideToAllTriStates(
  override: SegmentRoomSettingsOverride | null | undefined,
): Record<RoomSettingOverrideKey, RoomSettingTriState> {
  return {
    deputizeOnJoin: overrideToTriState(override, "deputizeOnJoin"),
    showQueueCount: overrideToTriState(override, "showQueueCount"),
    showQueueTracks: overrideToTriState(override, "showQueueTracks"),
    fetchMeta: overrideToTriState(override, "fetchMeta"),
    announceNowPlaying: overrideToTriState(override, "announceNowPlaying"),
  }
}

export function overrideToPlaybackModeTriState(
  override: SegmentRoomSettingsOverride | null | undefined,
): PlaybackModeTriState {
  const mode = override?.playbackMode
  if (mode === "spotify-controlled" || mode === "app-controlled") return mode
  return "unchanged"
}

export function overrideToDeputyBulkTriState(
  override: SegmentRoomSettingsOverride | null | undefined,
): DeputyBulkTriState {
  const a = override?.deputyBulkAction
  if (a === "deputize_all" || a === "dedeputize_all") return a
  return "unchanged"
}

export function buildOverrideFromTriStates(
  states: Record<RoomSettingOverrideKey, RoomSettingTriState>,
  deputyBulk: DeputyBulkTriState,
  playbackMode: PlaybackModeTriState,
): SegmentRoomSettingsOverride | null {
  const out: SegmentRoomSettingsOverride = {}
  for (const k of KEYS) {
    if (states[k] === "true") out[k] = true
    if (states[k] === "false") out[k] = false
  }
  if (playbackMode === "spotify-controlled" || playbackMode === "app-controlled") {
    out.playbackMode = playbackMode
  }
  if (deputyBulk === "deputize_all") out.deputyBulkAction = "deputize_all"
  if (deputyBulk === "dedeputize_all") out.deputyBulkAction = "dedeputize_all"
  return Object.keys(out).length === 0 ? null : out
}

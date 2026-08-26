import type { Room } from "../types/Room"

type QueueCountDisplay =
  | { kind: "hidden" }
  | { kind: "count"; value: number }
  | { kind: "redacted" }

function isQueueSettingEnabled(value: boolean | undefined): boolean {
  return value !== false
}

function isEverEnabledForRedaction(everEnabled: boolean | undefined): boolean {
  // Legacy rooms disabled before this feature: default was enabled, so treat unset as ever enabled.
  return everEnabled !== false
}

export function isQueueCountVisible(room: Room | undefined, isAdmin: boolean): boolean {
  return isAdmin || isQueueSettingEnabled(room?.showQueueCount)
}

export function isQueueCountRedacted(room: Room | undefined, isAdmin: boolean): boolean {
  if (isAdmin) return false
  if (isQueueSettingEnabled(room?.showQueueCount)) return false
  return isEverEnabledForRedaction(room?.showQueueCountEverEnabled)
}

export function isQueueTracksVisible(room: Room | undefined, isAdmin: boolean): boolean {
  return isAdmin || isQueueSettingEnabled(room?.showQueueTracks)
}

export function isQueueTracksRedacted(room: Room | undefined, isAdmin: boolean): boolean {
  if (isAdmin) return false
  if (isQueueSettingEnabled(room?.showQueueTracks)) return false
  return isEverEnabledForRedaction(room?.showQueueTracksEverEnabled)
}

export function hasQueueDisplayRedactionState(room: Room | undefined): boolean {
  return (
    room?.showQueueCountEverEnabled === true ||
    room?.showQueueTracksEverEnabled === true ||
    isQueueCountRedacted(room, false) ||
    isQueueTracksRedacted(room, false)
  )
}

export function getQueueCountDisplay(
  count: number,
  room: Room | undefined,
  isAdmin: boolean,
): QueueCountDisplay {
  if (isQueueCountVisible(room, isAdmin)) {
    if (count <= 0) return { kind: "hidden" }
    return { kind: "count", value: count }
  }

  if (isQueueCountRedacted(room, isAdmin)) {
    return { kind: "redacted" }
  }

  return { kind: "hidden" }
}

export type { QueueCountDisplay }

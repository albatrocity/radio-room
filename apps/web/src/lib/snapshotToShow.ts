import type { RoomScheduleSnapshotDTO, ShowDTO, ShowSegmentDTO } from "@repo/types"

/** Build a minimal ShowDTO for UI that expects API-shaped segments (e.g. schedule panel). */
export function snapshotToShowDTO(snapshot: RoomScheduleSnapshotDTO | null): ShowDTO | null {
  if (!snapshot) return null

  const segments: ShowSegmentDTO[] = snapshot.segments.map((s) => {
    const inner = s.segment
    const title = inner?.title ?? ""
    const pluginPreset = inner?.pluginPreset ?? null
    const durationMinutes = s.durationMinutes ?? 0
    return {
      id: `${snapshot.showId}:${s.segmentId}`,
      segmentId: s.segmentId,
      position: s.position ?? 0,
      durationOverride: s.durationOverride ?? null,
      segment: {
        id: s.segmentId,
        title,
        description: null,
        isRecurring: false,
        duration: durationMinutes,
        pluginPreset,
        roomSettingsOverride: null,
        status: "ready",
        createdBy: "",
        assignedTo: null,
        assignee: null,
        createdAt: snapshot.updatedAt,
        updatedAt: snapshot.updatedAt,
      },
    }
  })

  return {
    id: snapshot.showId,
    title: snapshot.showTitle,
    description: null,
    startTime: snapshot.startTime,
    endTime: null,
    roomId: null,
    status: "ready",
    createdBy: "",
    createdAt: snapshot.updatedAt,
    updatedAt: snapshot.updatedAt,
    segments,
  }
}

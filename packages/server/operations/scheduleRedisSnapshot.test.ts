import { describe, expect, it } from "vitest"
import { buildRoomScheduleSnapshotPayload, type ShowRowForSnapshot } from "./scheduleRedisSnapshot"

describe("buildRoomScheduleSnapshotPayload", () => {
  it("orders segments by position and computes durationMinutes", () => {
    const show = {
      id: "show-1",
      title: "Evening",
      startTime: new Date("2026-04-01T20:00:00.000Z"),
      segments: [
        {
          id: "join-2",
          segmentId: "seg-b",
          position: 1,
          durationOverride: null,
          segment: {
            title: "Second",
            duration: 12,
            pluginPreset: null,
          },
        },
        {
          id: "join-1",
          segmentId: "seg-a",
          position: 0,
          durationOverride: 20,
          segment: {
            title: "First",
            duration: 5,
            pluginPreset: { pluginConfigs: { demo: { foo: 1 } } },
          },
        },
      ],
    } as unknown as ShowRowForSnapshot

    const snap = buildRoomScheduleSnapshotPayload(show)

    expect(snap.version).toBe(1)
    expect(snap.showId).toBe("show-1")
    expect(snap.showTitle).toBe("Evening")
    expect(snap.startTime).toBe("2026-04-01T20:00:00.000Z")
    expect(snap.segments).toHaveLength(2)
    expect(snap.segments[0].segmentId).toBe("seg-a")
    expect(snap.segments[0].durationMinutes).toBe(20)
    expect(snap.segments[0].durationOverride).toBe(20)
    expect(snap.segments[0].segment.title).toBe("First")
    expect(snap.segments[0].segment.pluginPreset).toEqual({ pluginConfigs: { demo: { foo: 1 } } })
    expect(snap.segments[1].segmentId).toBe("seg-b")
    expect(snap.segments[1].durationMinutes).toBe(12)
    expect(snap.segments[1].durationOverride).toBeNull()
  })

  it("uses segment duration when override is null", () => {
    const show = {
      id: "s",
      title: "T",
      startTime: "2026-01-01T00:00:00.000Z",
      segments: [
        {
          id: "j",
          segmentId: "x",
          position: 0,
          durationOverride: null,
          segment: { title: "X", duration: 7, pluginPreset: null },
        },
      ],
    } as unknown as ShowRowForSnapshot

    const snap = buildRoomScheduleSnapshotPayload(show)
    expect(snap.segments[0].durationMinutes).toBe(7)
  })
})

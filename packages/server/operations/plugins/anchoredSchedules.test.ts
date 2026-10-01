import { describe, it, expect, beforeEach, vi } from "vitest"
import type { AppContext, PluginPlaybackReadResult } from "@repo/types"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import {
  PLUGIN_SCHEDULES_KEY,
  PLUGIN_SCHEDULES_PAYLOAD_KEY,
  anchoredSchedulesKey,
  claimDuePluginSchedules,
  getPluginSchedule,
  scheduleMember,
} from "../data/pluginSchedules"
import { recomputeAnchoredSchedules, scheduleAnchoredPluginCallback } from "./anchoredSchedules"

const readRoomPlayback = vi.hoisted(() => vi.fn<() => Promise<PluginPlaybackReadResult>>())
vi.mock("../playback/readRoomPlayback", () => ({ readRoomPlayback }))

const roomId = "room1"
const pluginName = "absent-dj"

function makeContext(redis: MemoryRedisClient, dispatchScheduleRevised: unknown): AppContext {
  return {
    redis: { pubClient: redis as never, subClient: redis as never },
    adapters: {
      playbackControllers: new Map(),
      metadataSources: new Map(),
      mediaSources: new Map(),
      serviceAuth: new Map(),
      playbackControllerModules: new Map(),
      metadataSourceModules: new Map(),
      mediaSourceModules: new Map(),
    },
    jobs: [],
    pluginRegistry: { dispatchScheduleRevised },
  }
}

function playing(
  progressMs = 0,
  durationMs = 180_000,
  state: "playing" | "paused" = "playing",
): PluginPlaybackReadResult {
  return { success: true, state, trackId: "t1", progressMs, durationMs }
}

describe("playback-anchored schedules (ADR 0196)", () => {
  let redis: MemoryRedisClient
  let revised: ReturnType<typeof vi.fn>
  let context: AppContext
  const member = scheduleMember(roomId, pluginName, "countdown")

  beforeEach(() => {
    vi.clearAllMocks()
    redis = new MemoryRedisClient()
    revised = vi.fn().mockResolvedValue(undefined)
    context = makeContext(redis, revised)
  })

  it("afterPlaybackMs does not fire across a pause and resumes with the remainder", async () => {
    const t0 = 1_000_000
    readRoomPlayback.mockResolvedValue(playing())
    const created = await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "countdown",
      kind: "countdown",
      anchor: { afterPlaybackMs: 60_000 },
      now: t0,
    })
    expect(created).toEqual({ ok: true, fireAt: t0 + 60_000, anchored: true, paused: false })

    await recomputeAnchoredSchedules({ context, roomId, observed: { state: "paused" }, now: t0 + 20_000 })
    expect(await redis.zScore(PLUGIN_SCHEDULES_KEY, member)).toBeNull()
    expect(revised).toHaveBeenLastCalledWith({
      roomId,
      pluginName,
      revision: expect.objectContaining({ paused: true, remainingMs: 40_000, cancelled: false }),
    })

    expect(await claimDuePluginSchedules({ context, now: t0 + 120_000 })).toHaveLength(0)

    await recomputeAnchoredSchedules({
      context,
      roomId,
      observed: { state: "playing" },
      now: t0 + 300_000,
    })
    expect(await redis.zScore(PLUGIN_SCHEDULES_KEY, member)).toBe(t0 + 340_000)
    expect(revised).toHaveBeenLastCalledWith({
      roomId,
      pluginName,
      revision: expect.objectContaining({ paused: false, fireAt: t0 + 340_000 }),
    })

    const fired = await claimDuePluginSchedules({ context, now: t0 + 340_000 })
    expect(fired).toEqual([
      { roomId, pluginName, scheduleId: "countdown", kind: "countdown", payload: null },
    ])
    expect(await redis.sCard(anchoredSchedulesKey(roomId))).toBe(0)
  })

  it("starts paused when the room is not playing and getSchedule reports it", async () => {
    readRoomPlayback.mockResolvedValue(playing(0, 180_000, "paused"))
    const created = await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "countdown",
      kind: "countdown",
      anchor: { afterPlaybackMs: 30_000 },
      now: 0,
    })
    expect(created).toMatchObject({ ok: true, anchored: true, paused: true })
    expect(await redis.zCard(PLUGIN_SCHEDULES_KEY)).toBe(0)
    expect(
      await getPluginSchedule({ context, roomId, pluginName, scheduleId: "countdown", now: 5_000 }),
    ).toMatchObject({ paused: true, fireAt: 35_000 })
  })

  it("atProgressMs moves when the playhead seeks", async () => {
    const t0 = 2_000_000
    readRoomPlayback.mockResolvedValue(playing(10_000))
    await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "drop",
      kind: "drop",
      anchor: { atProgressMs: 60_000 },
      now: t0,
    })
    const dropMember = scheduleMember(roomId, pluginName, "drop")
    expect(await redis.zScore(PLUGIN_SCHEDULES_KEY, dropMember)).toBe(t0 + 50_000)

    await recomputeAnchoredSchedules({ context, roomId, observed: { progressMs: 40_000 }, now: t0 })
    expect(await redis.zScore(PLUGIN_SCHEDULES_KEY, dropMember)).toBe(t0 + 20_000)
    expect(revised).toHaveBeenCalledWith({
      roomId,
      pluginName,
      revision: expect.objectContaining({ scheduleId: "drop", remainingMs: 20_000 }),
    })
  })

  it("leadMs targets the end of the track", async () => {
    readRoomPlayback.mockResolvedValue(playing(100_000, 180_000))
    const created = await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "finale",
      kind: "finale",
      anchor: { leadMs: 15_000 },
      now: 0,
    })
    expect(created).toMatchObject({ ok: true, fireAt: 65_000 })
  })

  it("cancels trackId anchors when TRACK_CHANGED names another track", async () => {
    readRoomPlayback.mockResolvedValue(playing())
    await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "countdown",
      kind: "countdown",
      anchor: { trackId: "t1", afterPlaybackMs: 60_000 },
    })
    await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "loose",
      kind: "loose",
      anchor: { afterPlaybackMs: 60_000 },
    })

    await recomputeAnchoredSchedules({ context, roomId, currentTrackId: "t1" })
    expect(await redis.zScore(PLUGIN_SCHEDULES_KEY, member)).not.toBeNull()

    await recomputeAnchoredSchedules({ context, roomId, currentTrackId: "t2" })
    expect(await redis.zScore(PLUGIN_SCHEDULES_KEY, member)).toBeNull()
    expect(await redis.hGet(PLUGIN_SCHEDULES_PAYLOAD_KEY, member)).toBeUndefined()
    expect(
      await redis.zScore(PLUGIN_SCHEDULES_KEY, scheduleMember(roomId, pluginName, "loose")),
    ).not.toBeNull()
    expect(revised).toHaveBeenCalledWith({
      roomId,
      pluginName,
      revision: expect.objectContaining({ scheduleId: "countdown", cancelled: true }),
    })
  })

  it("falls back to wall clock for afterPlaybackMs when playback is unreadable", async () => {
    readRoomPlayback.mockResolvedValue({ success: false, message: "nope" })
    const created = await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "countdown",
      kind: "countdown",
      anchor: { afterPlaybackMs: 60_000 },
      now: 0,
    })
    expect(created).toEqual({ ok: true, fireAt: 60_000, anchored: false, paused: false })
    expect(await redis.sCard(anchoredSchedulesKey(roomId))).toBe(0)

    const playhead = await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "drop",
      kind: "drop",
      anchor: { atProgressMs: 30_000 },
    })
    expect(playhead).toEqual({ ok: false, message: "nope" })
  })

  it("rejects anchors with zero or several offsets", async () => {
    const result = await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "x",
      kind: "x",
      anchor: { afterPlaybackMs: 5_000, atProgressMs: 1_000 } as never,
    })
    expect(result.ok).toBe(false)
    expect(readRoomPlayback).not.toHaveBeenCalled()
  })

  it("exits without reading playback when the room has no anchors", async () => {
    await recomputeAnchoredSchedules({ context, roomId })
    expect(readRoomPlayback).not.toHaveBeenCalled()
  })

  it("does not resurrect a schedule the sweep already claimed", async () => {
    readRoomPlayback.mockResolvedValue(playing())
    await scheduleAnchoredPluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId: "countdown",
      kind: "countdown",
      anchor: { afterPlaybackMs: 5_000 },
      now: 0,
    })
    await redis.zRem(PLUGIN_SCHEDULES_KEY, member)

    await recomputeAnchoredSchedules({ context, roomId, observed: { state: "paused" }, now: 1_000 })
    expect(revised).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, beforeEach, vi } from "vitest"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import {
  schedulePluginCallback,
  claimDuePluginSchedules,
  cancelPluginSchedule,
  PLUGIN_SCHEDULES_KEY,
} from "../data/pluginSchedules"
import { sweepPluginSchedules } from "../plugins/sweepPluginSchedules"
import type { AppContext } from "@repo/types"

function makeContext(redis: MemoryRedisClient, pluginRegistry?: unknown): AppContext {
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
    pluginRegistry,
  }
}

describe("plugin schedules (ADR 0190)", () => {
  let redis: MemoryRedisClient

  beforeEach(() => {
    redis = new MemoryRedisClient()
  })

  it("claims each due schedule only once across concurrent sweeps", async () => {
    const context = makeContext(redis)
    const now = 1_000_000
    await schedulePluginCallback({
      context,
      roomId: "room1",
      pluginName: "quiz-sessions",
      scheduleId: "auto-advance",
      kind: "auto-advance",
      fireAt: now - 100,
      payload: { round: 1 },
    })

    const [a, b] = await Promise.all([
      claimDuePluginSchedules({ context, now }),
      claimDuePluginSchedules({ context, now }),
    ])
    const all = [...a, ...b]
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      roomId: "room1",
      pluginName: "quiz-sessions",
      scheduleId: "auto-advance",
      kind: "auto-advance",
      payload: { round: 1 },
    })
    expect(await redis.zCard(PLUGIN_SCHEDULES_KEY)).toBe(0)
  })

  it("cancel removes schedule before fire", async () => {
    const context = makeContext(redis)
    await schedulePluginCallback({
      context,
      roomId: "r",
      pluginName: "p",
      scheduleId: "t1",
      kind: "tick",
      fireAt: Date.now() + 60_000,
    })
    expect(await cancelPluginSchedule({ context, roomId: "r", pluginName: "p", scheduleId: "t1" }))
      .toBe(true)
    const claimed = await claimDuePluginSchedules({ context, now: Date.now() + 120_000 })
    expect(claimed).toHaveLength(0)
  })

  it("sweep dispatches via pluginRegistry", async () => {
    const dispatchScheduled = vi.fn().mockResolvedValue(undefined)
    const context = makeContext(redis, { dispatchScheduled })
    const now = Date.now()
    await schedulePluginCallback({
      context,
      roomId: "roomA",
      pluginName: "the-fed",
      scheduleId: "tick",
      kind: "economy-tick",
      fireAt: now - 1,
      payload: null,
    })

    const { dispatched } = await sweepPluginSchedules({ context, now })
    expect(dispatched).toBe(1)
    expect(dispatchScheduled).toHaveBeenCalledWith({
      roomId: "roomA",
      pluginName: "the-fed",
      kind: "economy-tick",
      payload: null,
      scheduleId: "tick",
    })
  })
})

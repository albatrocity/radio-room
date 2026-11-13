import { beforeEach, describe, expect, test, vi } from "vitest"
import type { PluginContext, QueueItem, UserPersonaAssignment } from "@repo/types"
import { SkipperPlugin } from "./index"
import { getComponentSchema } from "./schema"
import { SKIPPER_PERSONA_FULL_ID, type SkipperConfig } from "./types"

const ROOM = "room-1"

function item(trackId: string, pin?: { pluginName: string; blockId: string }): QueueItem {
  return {
    title: `Song ${trackId}`,
    mediaSource: { type: "spotify", trackId },
    ...(pin ? { pin } : {}),
  } as unknown as QueueItem
}

type Harness = {
  context: PluginContext
  handlers: Map<string, Function[]>
  assignments: Map<string, UserPersonaAssignment[]>
  holders: string[]
  queue: QueueItem[]
  nowPlaying: QueueItem | null
  playbackMode: string
  queueAutoAdvance: boolean | undefined
  config: SkipperConfig
  emitted: { event: string; data: Record<string, unknown> }[]
  store: Map<string, string>
}

function createHarness(): Harness {
  const h = {
    handlers: new Map<string, Function[]>(),
    assignments: new Map<string, UserPersonaAssignment[]>(),
    holders: [] as string[],
    queue: [item("next")] as QueueItem[],
    nowPlaying: item("current") as QueueItem | null,
    playbackMode: "app-controlled",
    queueAutoAdvance: undefined,
    config: { enabled: true, skipLimit: 0 } as SkipperConfig,
    emitted: [] as { event: string; data: Record<string, unknown> }[],
    store: new Map<string, string>(),
  } as Harness

  const queueApi = {
    getNowPlaying: vi.fn(async () => h.nowPlaying),
    getQueue: vi.fn(async () => h.queue),
    skipTrack: vi.fn(async () => {}),
  }

  h.context = {
    roomId: ROOM,
    api: {
      getPluginConfig: vi.fn(async () => h.config),
      sendUserSystemMessage: vi.fn(async () => {}),
      sendSystemMessage: vi.fn(async () => {}),
      getUsersByIds: vi.fn(async () => []),
      emit: vi.fn(async (event: string, data: Record<string, unknown>) => {
        h.emitted.push({ event, data })
      }),
    },
    queue: queueApi,
    playback: {
      pausePlayback: vi.fn(async () => ({ success: true })),
    },
    personas: {
      registerPersonas: vi.fn(async () => {}),
      unregisterPersonas: vi.fn(async () => {}),
      getUserPersonas: vi.fn(async (userId: string) => h.assignments.get(userId) ?? []),
      getUsersWithPersona: vi.fn(async () => h.holders),
      remove: vi.fn(async (userId: string) => {
        h.assignments.delete(userId)
        h.holders = h.holders.filter((id) => id !== userId)
        await fire(h, "PERSONA_REMOVED", {
          roomId: ROOM,
          personaId: SKIPPER_PERSONA_FULL_ID,
          userId,
        })
      }),
    },
    lifecycle: {
      on: vi.fn((event: string, handler: Function) => {
        const list = h.handlers.get(event) ?? []
        list.push(handler)
        h.handlers.set(event, list)
      }),
      off: vi.fn(),
    },
    storage: {
      get: vi.fn(async (key: string) => h.store.get(key) ?? null),
      mget: vi.fn(async (keys: string[]) => keys.map((k) => h.store.get(k) ?? null)),
      inc: vi.fn(async (key: string) => {
        const next = Number(h.store.get(key) ?? 0) + 1
        h.store.set(key, String(next))
        return next
      }),
      dec: vi.fn(async (key: string) => {
        const next = Number(h.store.get(key) ?? 0) - 1
        h.store.set(key, String(next))
        return next
      }),
      del: vi.fn(async (key: string) => {
        h.store.delete(key)
      }),
    },
    getRoom: vi.fn(async () => ({
      playbackMode: h.playbackMode,
      queueAutoAdvance: h.queueAutoAdvance,
    })),
  } as unknown as PluginContext

  return h
}

function grant(h: Harness, userId: string) {
  h.assignments.set(userId, [
    { personaId: SKIPPER_PERSONA_FULL_ID, assignedBy: "admin", assignedAt: "now" },
  ])
  h.holders.push(userId)
}

async function fire(h: Harness, event: string, data: Record<string, unknown>) {
  for (const handler of h.handlers.get(event) ?? []) await handler(data)
}

describe("SkipperPlugin", () => {
  let h: Harness
  let plugin: SkipperPlugin

  beforeEach(async () => {
    h = createHarness()
    plugin = new SkipperPlugin()
    await plugin.register(h.context)
  })

  test("registers the ShipWheel persona, admin-assignable and decorating", () => {
    expect(h.context.personas.registerPersonas).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "skipper",
        label: "Skipper",
        icon: "ShipWheel",
        exclusive: false,
        assignableByAdmin: true,
        decoratesUser: true,
        decoratesChatMessage: true,
      }),
    ])
  })

  test("skip button is gated on canSkip and the viewer holding the persona", () => {
    const [button] = getComponentSchema().components
    expect(button).toMatchObject({
      type: "button",
      area: "playerControls",
      icon: "SkipForward",
      action: "skip",
    })
    expect(button).toHaveProperty("confirmMessage")
    expect(button!.showWhen).toEqual(
      expect.arrayContaining([
        { field: "canSkip", value: true },
        { field: "skipperUserIds", includes: "viewer.userId" },
      ]),
    )
  })

  test("publishes holders when the Skipper persona is assigned or removed", async () => {
    grant(h, "u1")
    await fire(h, "PERSONA_ASSIGNED", {
      roomId: ROOM,
      personaId: SKIPPER_PERSONA_FULL_ID,
      userId: "u1",
    })
    expect(h.emitted.at(-1)).toEqual({
      event: "SKIP_STATUS",
      data: { skipperUserIds: ["u1"], canSkip: true },
    })

    h.holders = []
    await fire(h, "PERSONA_REMOVED", {
      roomId: ROOM,
      personaId: SKIPPER_PERSONA_FULL_ID,
      userId: "u1",
    })
    expect(h.emitted.at(-1)?.data).toEqual({ skipperUserIds: [], canSkip: true })
  })

  test("tells the user privately when they gain or lose Skipper", async () => {
    const send = vi.mocked(h.context.api.sendUserSystemMessage)
    await fire(h, "PERSONA_ASSIGNED", {
      roomId: ROOM,
      personaId: SKIPPER_PERSONA_FULL_ID,
      userId: "u1",
    })
    expect(send).toHaveBeenLastCalledWith(
      ROOM,
      "u1",
      expect.stringContaining("promoted to Skipper"),
      expect.objectContaining({ status: "success" }),
    )

    await fire(h, "PERSONA_REMOVED", {
      roomId: ROOM,
      personaId: SKIPPER_PERSONA_FULL_ID,
      userId: "u1",
    })
    expect(send).toHaveBeenLastCalledWith(
      ROOM,
      "u1",
      "You're no longer a Skipper.",
      expect.objectContaining({ status: "info" }),
    )
  })

  test("ignores other personas", async () => {
    await fire(h, "PERSONA_ASSIGNED", { roomId: ROOM, personaId: "vip", userId: "u1" })
    expect(h.emitted).toHaveLength(0)
    expect(h.context.api.sendUserSystemMessage).not.toHaveBeenCalled()
  })

  describe("canSkip", () => {
    test("false when the queue is empty", async () => {
      h.queue = []
      await fire(h, "QUEUE_CHANGED", { queue: [] })
      expect(h.emitted.at(-1)?.data.canSkip).toBe(false)
    })

    test("false outside app-controlled playback", async () => {
      h.playbackMode = "spotify-controlled"
      await fire(h, "QUEUE_CHANGED", { queue: [] })
      expect(h.emitted.at(-1)?.data.canSkip).toBe(false)
    })

    test("false when another plugin pins the current track", async () => {
      h.nowPlaying = item("current", { pluginName: "queue-theme", blockId: "b" })
      await fire(h, "QUEUE_CHANGED", { queue: [] })
      expect(h.emitted.at(-1)?.data.canSkip).toBe(false)
    })

    test("true with a waiting track", async () => {
      await fire(h, "QUEUE_CHANGED", { queue: [] })
      expect(h.emitted.at(-1)?.data.canSkip).toBe(true)
    })

    test("nothing is published while disabled", async () => {
      const off = createHarness()
      off.config = { enabled: false, skipLimit: 0 }
      await new SkipperPlugin().register(off.context)
      await fire(off, "QUEUE_CHANGED", { queue: [] })
      expect(off.emitted).toHaveLength(0)
      expect(off.context.personas.registerPersonas).not.toHaveBeenCalled()
    })
  })

  describe("skip action", () => {
    test("skips the current track for a Skipper with a waiting track", async () => {
      grant(h, "u1")
      const result = await plugin.executeAction("skip", { userId: "u1", username: "U" })
      expect(result.success).toBe(true)
      expect(h.context.queue.skipTrack).toHaveBeenCalledWith(ROOM, "current")
      expect(h.context.api.sendSystemMessage).toHaveBeenCalledWith(
        ROOM,
        'U skipped "Song current"',
        { type: "alert", status: "info" },
      )
    })

    test("announces the Skipper's current username, not the one from join", async () => {
      grant(h, "u1")
      vi.mocked(h.context.api.getUsersByIds).mockResolvedValueOnce([
        { userId: "u1", username: "Renamed" } as never,
      ])
      await plugin.executeAction("skip", { userId: "u1", username: "Old Name" })
      expect(h.context.api.getUsersByIds).toHaveBeenCalledWith(["u1"])
      expect(h.context.api.sendSystemMessage).toHaveBeenCalledWith(
        ROOM,
        'Renamed skipped "Song current"',
        { type: "alert", status: "info" },
      )
    })

    test("rejects an admin without the persona", async () => {
      const result = await plugin.executeAction("skip", { userId: "admin", username: "A" })
      expect(result.success).toBe(false)
      expect(h.context.queue.skipTrack).not.toHaveBeenCalled()
      expect(h.context.api.sendSystemMessage).not.toHaveBeenCalled()
    })

    test("rejects when the queue is empty", async () => {
      grant(h, "u1")
      h.queue = []
      const result = await plugin.executeAction("skip", { userId: "u1", username: "U" })
      expect(result.success).toBe(false)
      expect(h.context.queue.skipTrack).not.toHaveBeenCalled()
    })

    test("rejects a track pinned by another plugin", async () => {
      grant(h, "u1")
      h.nowPlaying = item("current", { pluginName: "queue-theme", blockId: "b" })
      const result = await plugin.executeAction("skip", { userId: "u1", username: "U" })
      expect(result.success).toBe(false)
      expect(h.context.queue.skipTrack).not.toHaveBeenCalled()
    })

    test("pauses instead of skipping when queue auto-advance is off", async () => {
      grant(h, "u1")
      h.queueAutoAdvance = false
      const result = await plugin.executeAction("skip", { userId: "u1", username: "U" })
      expect(result).toEqual({ success: true, message: "Paused" })
      expect(h.context.playback.pausePlayback).toHaveBeenCalledWith(ROOM)
      expect(h.context.queue.skipTrack).not.toHaveBeenCalled()
      expect(h.emitted.at(-1)?.data.canSkip).toBe(false)
      expect(h.context.api.sendSystemMessage).toHaveBeenCalledWith(
        ROOM,
        'U skipped "Song current" (paused; queue auto-advance is off)',
        { type: "alert", status: "info" },
      )
    })

    test("passes a pause failure through", async () => {
      grant(h, "u1")
      h.queueAutoAdvance = false
      vi.mocked(h.context.playback.pausePlayback).mockResolvedValueOnce({
        success: false,
        message: "No device",
      })
      const result = await plugin.executeAction("skip", { userId: "u1", username: "U" })
      expect(result).toEqual({ success: false, message: "No device" })
      expect(h.context.api.sendSystemMessage).not.toHaveBeenCalled()
    })

    test("with auto-advance off, hides while paused and returns when playing", async () => {
      h.queueAutoAdvance = false
      await fire(h, "PLAYBACK_STATE_CHANGED", { roomId: ROOM, state: "paused", trackId: "current" })
      expect(h.emitted.at(-1)?.data.canSkip).toBe(false)
      await fire(h, "PLAYBACK_STATE_CHANGED", {
        roomId: ROOM,
        state: "playing",
        trackId: "current",
      })
      expect(h.emitted.at(-1)?.data.canSkip).toBe(true)
    })

    test("with auto-advance on, a paused track can still be skipped", async () => {
      grant(h, "u1")
      await fire(h, "PLAYBACK_STATE_CHANGED", { roomId: ROOM, state: "paused", trackId: "current" })
      const result = await plugin.executeAction("skip", { userId: "u1", username: "U" })
      expect(result.success).toBe(true)
      expect(h.context.queue.skipTrack).toHaveBeenCalledWith(ROOM, "current")
    })

    test("rejects when disabled", async () => {
      grant(h, "u1")
      h.config = { enabled: false, skipLimit: 0 }
      await fire(h, "CONFIG_CHANGED", {
        roomId: ROOM,
        pluginName: "skipper",
        config: { enabled: false },
        previousConfig: { enabled: true },
      })
      const result = await plugin.executeAction("skip", { userId: "u1", username: "U" })
      expect(result.success).toBe(false)
    })
  })

  describe("skip limit", () => {
    const skip = () => plugin.executeAction("skip", { userId: "u1", username: "U" })

    async function withLimit(skipLimit: number) {
      h = createHarness()
      h.config = { enabled: true, skipLimit }
      plugin = new SkipperPlugin()
      await plugin.register(h.context)
      grant(h, "u1")
    }

    beforeEach(() => withLimit(2))

    test("allows up to the limit, then removes the persona", async () => {
      expect((await skip()).success).toBe(true)
      expect((await skip()).success).toBe(true)
      expect(h.context.personas.remove).toHaveBeenCalledWith("u1", "skipper")
      const third = await skip()
      expect(third).toEqual({ success: false, message: "Only a Skipper can skip" })
      expect(h.context.queue.skipTrack).toHaveBeenCalledTimes(2)
    })

    test("tells the Skipper how many skips are left, then that they're retired", async () => {
      const send = vi.mocked(h.context.api.sendUserSystemMessage)
      await skip()
      expect(send).toHaveBeenLastCalledWith(
        ROOM,
        "u1",
        "You have 1 skip left.",
        expect.objectContaining({ status: "info" }),
      )
      send.mockClear()
      await skip()
      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith(
        ROOM,
        "u1",
        "That was your last skip, so you're no longer a Skipper.",
        expect.objectContaining({ status: "warning" }),
      )
    })

    test("the last skip clears the count and hides the button", async () => {
      await skip()
      await skip()
      expect(h.store.has("skips-used:u1")).toBe(false)
      expect(h.emitted.at(-1)?.data).toEqual({ skipperUserIds: [], canSkip: true })
    })

    test("an admin removing the persona still sends the plain notice", async () => {
      await skip()
      await h.context.personas.remove("u1", "skipper")
      expect(h.context.api.sendUserSystemMessage).toHaveBeenLastCalledWith(
        ROOM,
        "u1",
        "You're no longer a Skipper.",
        expect.anything(),
      )
    })

    test("a failed pause does not spend a skip", async () => {
      h.queueAutoAdvance = false
      vi.mocked(h.context.playback.pausePlayback).mockResolvedValueOnce({
        success: false,
        message: "No device",
      })
      await skip()
      expect(h.store.get("skips-used:u1")).toBe("0")
    })

    test("reassigning after retirement starts a fresh limit", async () => {
      await skip()
      await skip()

      grant(h, "u1")
      await fire(h, "PERSONA_ASSIGNED", {
        roomId: ROOM,
        personaId: SKIPPER_PERSONA_FULL_ID,
        userId: "u1",
      })
      expect(h.context.api.sendUserSystemMessage).toHaveBeenLastCalledWith(
        ROOM,
        "u1",
        expect.stringContaining("You have 2 skips."),
        expect.anything(),
      )
      expect((await skip()).success).toBe(true)
    })

    test("a limit of 0 is unlimited and keeps no count", async () => {
      await withLimit(0)
      for (let i = 0; i < 5; i++) expect((await skip()).success).toBe(true)
      expect(h.store.size).toBe(0)
    })
  })
})

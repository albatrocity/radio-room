import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PluginContext, Poll } from "@repo/types"
import { SAMPLE_TRIP_MAP, type TripStore } from "@repo/road-trip-map"
import { RoadTripPlugin } from "./index"

const T0 = Date.parse("2026-10-02T20:00:00.000Z")
const MIN = 60_000
const ADMIN = { userId: "host", username: "Host" }

type Schedule = { id: string; kind: string; at: number; payload: unknown }

function createHarness() {
  const kv = new Map<string, string>()
  const lists = new Map<string, string[]>()
  const schedules = new Map<string, Schedule>()
  const handlers = new Map<string, (data: any) => unknown>()
  const signs: { title: string; status?: string; theme?: string }[] = []
  const emitted: Record<string, unknown>[] = []
  let activePoll: Poll | null = null
  const votes = new Map<string, Record<string, number>>()
  const shopCalls: unknown[][] = []
  let session: { id: string } | null = { id: "game-1" }

  const storage = {
    getJson: async (key: string) => {
      const raw = kv.get(key) ?? null
      return { raw, value: raw ? JSON.parse(raw) : null }
    },
    setJson: async (key: string, value: unknown) => {
      kv.set(key, JSON.stringify(value))
    },
    updateJson: async (key: string, fn: (prev: unknown) => unknown) => {
      const raw = kv.get(key)
      const next = fn(raw ? JSON.parse(raw) : null)
      kv.set(key, JSON.stringify(next))
      return next
    },
    del: async (key: string) => {
      kv.delete(key)
      lists.delete(key)
    },
    lrange: async (key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? []
      return list.slice(start, stop === -1 ? undefined : stop + 1)
    },
    appendCapped: async (key: string, entry: unknown, max: number) => {
      const list = [JSON.stringify(entry), ...(lists.get(key) ?? [])].slice(0, max)
      lists.set(key, list)
    },
  }

  const api = {
    isRoomAdmin: vi.fn(async () => true),
    getPluginConfig: vi.fn(async () => null),
    emit: vi.fn(async (_event: string, data: Record<string, unknown>) => {
      emitted.push(data)
    }),
    schedule: vi.fn(async (params: Schedule) => {
      schedules.set(params.id, params)
      return { ok: true, fireAt: params.at }
    }),
    cancelSchedule: vi.fn(async (id: string) => schedules.delete(id)),
    sendSystemMessage: vi.fn(async (_roomId: string, _content: string, meta: any) => {
      signs.push({ title: meta.title, status: meta.status, theme: meta.theme })
    }),
    sendUserSystemMessage: vi.fn(async () => {}),
    createPoll: vi.fn(async (params: any) => {
      if (activePoll) {
        return { ok: false, error: { status: 409, error: "Conflict", message: "busy" } }
      }
      activePoll = {
        id: `poll-${Date.now()}`,
        roomId: "room-1",
        question: params.question,
        options: [
          { id: "opt-stop", label: params.options[0].label },
          { id: "opt-skip", label: params.options[1].label },
        ],
        status: "open",
        settings: { hideRunningTotal: false },
        createdAt: Date.now(),
        createdBy: params.userId,
        publishedAt: Date.now(),
        closedAt: null,
        closesAt: params.closesAt,
        presentation: params.presentation,
      }
      return { ok: true, poll: activePoll }
    }),
    closePoll: vi.fn(async ({ pollId }: { pollId: string }) => {
      if (activePoll?.id === pollId) activePoll = null
      return { ok: true }
    }),
    tallyPoll: vi.fn(async (pollId: string) => votes.get(pollId) ?? {}),
    requestCapability: vi.fn(async (...args: unknown[]) => {
      shopCalls.push(args)
      return {
        ok: true,
        value: (args[2] === "closeRoomShop" ? undefined : { ok: true }) as unknown,
        provider: "item-shops",
      }
    }),
  }

  const context = {
    roomId: "room-1",
    storage,
    api,
    lifecycle: {
      on: (event: string, handler: (data: any) => unknown) =>
        handlers.set(`${event}:${handlers.size}`, handler),
    },
    game: { getActiveSession: async () => session },
    getRoom: async () => ({ id: "room-1", creator: "host" }),
  } as unknown as PluginContext

  return {
    context,
    api,
    signs,
    emitted,
    schedules,
    shopCalls,
    votes,
    get activePoll() {
      return activePoll
    },
    setSession(next: { id: string } | null) {
      session = next
    },
    async fire(event: string, data: unknown) {
      for (const [key, handler] of Array.from(handlers))
        if (key.startsWith(`${event}:`)) await handler(data)
    },
  }
}

async function runUntil(
  plugin: RoadTripPlugin,
  h: ReturnType<typeof createHarness>,
  until: number,
) {
  for (let guard = 0; guard < 200; guard++) {
    const poll = h.activePoll
    const next = Array.from(h.schedules.values()).sort((a, b) => a.at - b.at)[0]
    const pollAt = poll?.closesAt ?? Infinity
    const nextAt = Math.min(next?.at ?? Infinity, pollAt)
    if (nextAt > until) break
    vi.setSystemTime(nextAt)
    if (poll && pollAt === nextAt) {
      const tallies = { "opt-stop": 0, "opt-skip": 0, ...(h.votes.get(poll.id) ?? {}) }
      await h.api.closePoll({ pollId: poll.id })
      await h.fire("POLL_CLOSED", {
        roomId: "room-1",
        poll: { ...poll, status: "closed" },
        results: {
          pollId: poll.id,
          totalVotes: 0,
          optionTallies: tallies,
          winners: [],
          closedAt: nextAt,
        },
      })
      continue
    }
    h.schedules.delete(next!.id)
    await plugin.handleScheduled(next!.kind, next!.payload, next!.id)
  }
  vi.setSystemTime(until)
}

function lastTrip(h: ReturnType<typeof createHarness>): TripStore {
  return h.emitted.at(-1)?.trip as TripStore
}

describe("RoadTripPlugin", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function setup() {
    const h = createHarness()
    const plugin = new RoadTripPlugin()
    await plugin.register(h.context)
    return { plugin, h }
  }

  it("rejects invalid maps and loads the sample map", async () => {
    const { plugin, h } = await setup()
    const bad = await plugin.executeAction("loadMap", ADMIN, { mapJson: "{}" })
    expect(bad.success).toBe(false)

    const ok = await plugin.executeAction("loadMap", ADMIN, {
      mapJson: JSON.stringify(SAMPLE_TRIP_MAP),
    })
    expect(ok).toEqual({ success: true, message: 'Loaded "Concert Run": 12.0 mi, 3 sites.' })
    expect(h.emitted.at(-1)).toMatchObject({
      tripActive: true,
      tripProgress: expect.stringContaining("Loaded"),
    })
    expect(lastTrip(h).sites.map((s) => s.state)).toEqual([
      "unrevealed",
      "unrevealed",
      "unrevealed",
    ])
  })

  it("loads a map whose shop this room can't open, with the warning", async () => {
    const { plugin, h } = await setup()
    const warning =
      "Record Store only opens in rooms on the Media Bridge with a local library; the van still stops"
    h.api.requestCapability.mockResolvedValueOnce({
      ok: true,
      value: { ok: true, warnings: [warning] },
      provider: "item-shops",
    })
    const result = await plugin.executeAction("loadMap", ADMIN, {
      mapJson: JSON.stringify(SAMPLE_TRIP_MAP),
    })
    expect(result).toEqual({
      success: true,
      message: `Loaded "Concert Run": 12.0 mi, 3 sites. Warnings: Farmers Market: ${warning}`,
    })
  })

  it("requires an admin", async () => {
    const { plugin, h } = await setup()
    h.api.isRoomAdmin.mockResolvedValue(false)
    expect(await plugin.executeAction("depart", ADMIN)).toEqual({
      success: false,
      message: "Admin required",
    })
  })

  it("won't depart without a game session (D7)", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: JSON.stringify(SAMPLE_TRIP_MAP) })
    h.setSession(null)
    expect(await plugin.executeAction("depart", ADMIN)).toEqual({
      success: false,
      message: "Start a game session before the van can leave.",
    })
  })

  it("plays the Phase 1 trip end to end", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: JSON.stringify(SAMPLE_TRIP_MAP) })
    expect(await plugin.executeAction("depart", ADMIN)).toMatchObject({ success: true })
    expect(Array.from(h.schedules.keys()).sort()).toEqual([
      "arrive:concert",
      "arrive:farmers-market",
      "arrive:record-store",
      "reveal:concert",
      "reveal:farmers-market",
      "reveal:record-store",
      "skip-poll:farmers-market",
      "skip-poll:record-store",
    ])

    // Record Store poll opens at 2:30; the room votes to keep driving.
    await runUntil(plugin, h, T0 + 2.5 * MIN)
    const poll = h.activePoll!
    expect(poll.question).toBe("Dusty Boots Records in 2 miles: pull off?")
    expect(poll.presentation).toMatchObject({
      theme: "road-trip",
      eyebrow: "EXIT 4",
      headline: "DUSTY BOOTS RECORDS",
      footnote: "No votes = keep driving",
    })
    h.votes.set(poll.id, { "opt-stop": 1, "opt-skip": 4 })

    await runUntil(plugin, h, T0 + 8 * MIN)
    expect(lastTrip(h).live).toMatchObject({
      kind: "parked",
      label: "Farmers Market",
      shopOpen: true,
    })
    expect(h.shopCalls[1]).toEqual([
      "room-1",
      "shopAccess",
      "openRoomShop",
      {
        scopeId: expect.stringContaining(":site:farmers-market"),
        shopIds: ["farmers-market"],
        openingMessage: SAMPLE_TRIP_MAP.sites[1]!.shop!.openingMessage,
      },
    ])

    await runUntil(plugin, h, T0 + 30 * MIN)
    const trip = lastTrip(h)
    expect(trip.status).toBe("arrived")
    expect(trip.arrivedAt).toBe(T0 + 16 * MIN)
    expect(trip.sites.find((s) => s.id === "record-store")?.state).toBe("skipped")
    expect(trip.sites.find((s) => s.id === "farmers-market")).toMatchObject({
      state: "visited",
      lore: expect.any(String),
    })
    expect(h.shopCalls.map((c) => c[2])).toEqual(["validateShop", "openRoomShop", "closeRoomShop"])
    expect(h.signs.every((s) => s.theme === "road-trip")).toBe(true)
    expect(h.api.sendUserSystemMessage).toHaveBeenCalledWith(
      "room-1",
      "host",
      expect.stringContaining("Arrived at The Concert"),
      expect.objectContaining({ theme: "road-trip" }),
    )
    expect(h.emitted.at(-1)?.tripWarnings).toBe("Arrived at The Concert: activate the next segment")
    expect(h.schedules.size).toBe(0)

    const exported = await plugin.augmentRoomExport({} as never)
    expect(exported.markdownSections?.[0]).toContain("Dusty Boots Records: skipped (4–1)")
    expect((exported.data as { summary: { status: string } }).summary.status).toBe("arrived")
  })

  it("defers a skip poll around another poll, then applies the default", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: JSON.stringify(SAMPLE_TRIP_MAP) })
    await plugin.executeAction("depart", ADMIN)
    // Someone else's poll holds the slot for the whole approach.
    await h.api.createPoll({
      question: "Host poll",
      options: [{ label: "a" }, { label: "b" }],
      closesAt: T0 + 60 * MIN,
    })
    await runUntil(plugin, h, T0 + 4 * MIN + 1)
    expect(lastTrip(h).sites.find((s) => s.id === "record-store")?.state).toBe("skipped")
    expect(
      h.api.createPoll.mock.calls.filter((c) => c[0].question !== "Host poll").length,
    ).toBeGreaterThan(1)
  })

  it("locks the map after departure and supports new trip / unload", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: JSON.stringify(SAMPLE_TRIP_MAP) })
    await plugin.executeAction("depart", ADMIN)
    expect(
      (await plugin.executeAction("loadMap", ADMIN, { mapJson: JSON.stringify(SAMPLE_TRIP_MAP) }))
        .success,
    ).toBe(false)
    expect((await plugin.executeAction("newTrip", ADMIN)).message).toBe("End the trip first.")
    expect((await plugin.executeAction("endTrip", ADMIN)).success).toBe(true)
    expect(lastTrip(h).status).toBe("stranded")
    expect(h.schedules.size).toBe(0)
    expect((await plugin.executeAction("newTrip", ADMIN)).success).toBe(true)
    expect(lastTrip(h).status).toBe("loaded")
    expect((await plugin.executeAction("unloadMap", ADMIN)).success).toBe(true)
    expect(h.emitted.at(-1)).toMatchObject({ tripActive: false, trip: null })
  })

  it("pauses when the game session ends and resumes when one starts", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: JSON.stringify(SAMPLE_TRIP_MAP) })
    await plugin.executeAction("depart", ADMIN)
    vi.setSystemTime(T0 + MIN)
    await h.fire("GAME_SESSION_ENDED", {})
    expect(lastTrip(h).live).toEqual({ kind: "paused", label: "No game session" })
    expect(Array.from(h.schedules.keys()).some((id) => id.startsWith("arrive:"))).toBe(false)
    await h.fire("GAME_SESSION_STARTED", {})
    expect(lastTrip(h).van.mph).toBe(60)
  })

  it("declares schedulesIgnoreEnabled so a replace activation can't stop a trip (D2)", () => {
    expect(new RoadTripPlugin().schedulesIgnoreEnabled).toBe(true)
  })

  it("keeps one ledger when mutations overlap (leg commits inside the CAS)", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: JSON.stringify(SAMPLE_TRIP_MAP) })
    await plugin.executeAction("depart", ADMIN)
    vi.setSystemTime(T0 + 2 * MIN)
    // Pause and a session end land together; both stop the van, so exactly one stop leg.
    await Promise.all([
      plugin.executeAction("pause", ADMIN),
      h.fire("GAME_SESSION_ENDED", { roomId: "room-1" }),
    ])
    const legs = (await h.context.storage.lrange("trip:legs", 0, -1)).map((l) => JSON.parse(l))
    expect(legs.map((l: { mph: number }) => l.mph)).toEqual([0, 60])
    const state = (await h.context.storage.getJson<{ leg: unknown; blockers: unknown[] }>("trip:state"))
      .value!
    expect(state.leg).toEqual(legs[0])
    expect(state.blockers).toHaveLength(2)
  })

  it("re-arms a threshold that fired without changing anything", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: JSON.stringify(SAMPLE_TRIP_MAP) })
    await plugin.executeAction("depart", ADMIN)
    const arrive = h.schedules.get("arrive:concert")!
    // Fires early (stale schedule): the van isn't there yet, so it's a no-op...
    h.schedules.delete(arrive.id)
    await plugin.handleScheduled(arrive.kind, arrive.payload, arrive.id)
    // ...and the arrival is armed again at the same time.
    expect(h.schedules.get("arrive:concert")?.at).toBe(arrive.at)
  })

  it("doesn't rewrite unchanged schedules on every change", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: JSON.stringify(SAMPLE_TRIP_MAP) })
    await plugin.executeAction("depart", ADMIN)
    h.api.schedule.mockClear()
    // Revealing a site changes state but no fire times.
    const reveal = Array.from(h.schedules.values()).find((s) => s.kind === "reveal")!
    vi.setSystemTime(reveal.at)
    h.schedules.delete(reveal.id)
    await plugin.handleScheduled(reveal.kind, reveal.payload, reveal.id)
    expect(h.api.schedule).not.toHaveBeenCalled()
  })
})

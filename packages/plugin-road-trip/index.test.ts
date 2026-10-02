import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import type { PluginContext, Poll } from "@repo/types"
import { SAMPLE_TRIP_MAP, type TripStore } from "@repo/road-trip-map"
import { RoadTripPlugin } from "./index"

const T0 = Date.parse("2026-10-02T20:00:00.000Z")
const MIN = 60_000
const ADMIN = { userId: "host", username: "Host" }

/** The Phase 1–2 sample trip: no Mechanic and no scripted events. */
const BASE_MAP_JSON = JSON.stringify({
  ...SAMPLE_TRIP_MAP,
  sites: SAMPLE_TRIP_MAP.sites.filter((site) => !site.services?.mechanic),
  scriptedEvents: undefined,
})

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
  const wallets: Record<string, number> = { host: 100, ada: 1_000 }
  /** Item definition ids each user holds. */
  const holdings: Record<string, string[]> = {}
  const registeredItems: { shortId: string }[] = []

  const storage = {
    getJson: async (key: string) => {
      const raw = kv.get(key) ?? null
      return { raw, value: raw ? JSON.parse(raw) : null }
    },
    setJson: async (key: string, value: unknown) => {
      kv.set(key, JSON.stringify(value))
    },
    compareAndSet: async (key: string, expected: string | null, value: string) => {
      if ((kv.get(key) ?? null) !== expected) return false
      kv.set(key, value)
      return true
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
    getOnlineUserIds: vi.fn(async () => Object.keys(wallets)),
    getUsersByIds: vi.fn(async (ids: string[]) =>
      ids.map((userId) => ({ userId, username: userId.toUpperCase() })),
    ),
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
    game: {
      getActiveSession: async () => session,
      getEconomyScale: vi.fn(async () => ({ costScale: 1, earnScale: 1 })),
      getUserState: async (userId: string) =>
        userId in wallets
          ? { userId, attributes: { coin: wallets[userId], score: 0 }, modifiers: [] }
          : null,
      addScore: vi.fn(async (userId: string, _attr: string, amount: number) => {
        wallets[userId] = (wallets[userId] ?? 0) + amount
        return wallets[userId]
      }),
    },
    inventory: {
      registerItemDefinitions: (definitions: { shortId: string }[]) =>
        registeredItems.push(...definitions),
      hasItem: async (userId: string, definitionId: string) =>
        holdings[userId]?.includes(definitionId) ?? false,
      getInventory: async (userId: string) => ({
        userId,
        items: (holdings[userId] ?? []).map((definitionId, i) => ({
          itemId: `${userId}-${i}`,
          definitionId,
          quantity: 1,
        })),
      }),
    },
    getRoom: async () => ({ id: "room-1", creator: "host" }),
  } as unknown as PluginContext

  return {
    context,
    api,
    wallets,
    holdings,
    registeredItems,
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
      mapJson: BASE_MAP_JSON,
    })
    expect(ok).toEqual({ success: true, message: 'Loaded "Concert Run": 12.0 mi, 4 sites.' })
    expect(h.emitted.at(-1)).toMatchObject({
      tripActive: true,
      tripProgress: expect.stringContaining("Loaded"),
      tripFuel: "Gas 100% · Funds: automatic (split by wealth)",
      tripPoolOpen: false,
    })
    expect(lastTrip(h).sites.map((s) => s.state)).toEqual([
      "unrevealed",
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
      mapJson: BASE_MAP_JSON,
    })
    expect(result).toEqual({
      success: true,
      message: `Loaded "Concert Run": 12.0 mi, 4 sites. Warnings: Gas 'n' Go: ${warning}`,
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
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
    h.setSession(null)
    expect(await plugin.executeAction("depart", ADMIN)).toEqual({
      success: false,
      message: "Start a game session before the van can leave.",
    })
  })

  it("plays the sample trip end to end", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
    expect(await plugin.executeAction("depart", ADMIN)).toMatchObject({ success: true })
    expect(Array.from(h.schedules.keys()).sort()).toEqual([
      "arrive:concert",
      "arrive:farmers-market",
      "arrive:gas-n-go",
      "arrive:record-store",
      "fuel:empty",
      "fuel:low",
      "reveal:concert",
      "reveal:farmers-market",
      "reveal:gas-n-go",
      "reveal:record-store",
      "skip-poll:farmers-market",
      "skip-poll:gas-n-go",
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

    // The gas poll opens at 4:30 with the van due to arrive at 10%: urgent, defaults to stop.
    await runUntil(plugin, h, T0 + 4.5 * MIN)
    expect(h.activePoll?.question).toBe(
      "⛽ 10% · last gas before the end. Gas 'n' Go in 2 miles: pull off?",
    )
    expect(h.activePoll?.presentation).toMatchObject({
      variant: "warning",
      eyebrow: "⛽ 10% · last gas before the end",
      footnote: "No votes = pull off",
    })

    // Parks at 6:00; the automatic levy splits 108 coins by wealth (1,000 / 100).
    await runUntil(plugin, h, T0 + 6 * MIN + 1)
    expect(lastTrip(h).live).toMatchObject({ kind: "fund", mode: "automatic", cost: 108 })
    expect(h.wallets).toEqual({ host: 90, ada: 902 })
    expect(h.api.sendUserSystemMessage).toHaveBeenCalledWith(
      "room-1",
      "ada",
      "Gas took 9.8% of everyone's wallet. Your share: 98 coins.",
      expect.objectContaining({ theme: "road-trip" }),
    )

    await runUntil(plugin, h, T0 + 10 * MIN)
    expect(lastTrip(h).live).toMatchObject({
      kind: "parked",
      label: "Farmers Market",
      shopOpen: true,
    })
    const opened = h.shopCalls.filter((c) => c[2] === "openRoomShop")
    expect(opened[0]?.[3]).toEqual({
      scopeId: expect.stringContaining(":site:gas-n-go"),
      shopIds: [],
      offers: SAMPLE_TRIP_MAP.sites.find((s) => s.id === "gas-n-go")!.shop!.offers,
      title: "Gas 'n' Go counter",
    })
    expect(opened[1]).toEqual([
      "room-1",
      "shopAccess",
      "openRoomShop",
      {
        scopeId: expect.stringContaining(":site:farmers-market"),
        shopIds: ["farmers-market"],
        openingMessage: SAMPLE_TRIP_MAP.sites.find((s) => s.id === "farmers-market")!.shop!
          .openingMessage,
      },
    ])

    await runUntil(plugin, h, T0 + 30 * MIN)
    const trip = lastTrip(h)
    expect(trip.status).toBe("arrived")
    expect(trip.arrivedAt).toBe(T0 + 18 * MIN)
    expect(h.signs.map((s) => s.status)).toContain("success")
    expect(trip.sites.find((s) => s.id === "record-store")?.state).toBe("skipped")
    expect(trip.sites.find((s) => s.id === "farmers-market")).toMatchObject({
      state: "visited",
      lore: expect.any(String),
    })
    expect(h.shopCalls.map((c) => c[2])).toEqual([
      "validateShop",
      "validateShop",
      "openRoomShop",
      "closeRoomShop",
      "openRoomShop",
      "closeRoomShop",
    ])
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
    expect(exported.markdownSections?.[0]).toContain(
      "⛽ Gas 'n' Go: 108 coins from 2 travelers, filled 13.5 gal",
    )
    expect(exported.markdownSections?.[0]).toContain("| ADA | 98 |")
    expect((exported.data as { summary: { status: string } }).summary.status).toBe("arrived")
  })

  it("voluntary mode: anyone chips in, and meeting the goal fills up early", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
    expect(await plugin.executeAction("switchFundsMode", ADMIN)).toMatchObject({ success: true })
    expect(h.emitted.at(-1)?.tripFuel).toBe("Gas 100% · Funds: voluntary (chip in)")
    await plugin.executeAction("depart", ADMIN)
    expect((await plugin.executeAction("switchFundsMode", ADMIN)).success).toBe(false)

    await runUntil(plugin, h, T0 + 6 * MIN + 1)
    expect(h.emitted.at(-1)).toMatchObject({
      tripPoolOpen: true,
      tripPool: { title: "Gas at Gas 'n' Go", goal: 108, raised: 0, open: true },
    })
    // Pledging isn't an admin action.
    h.api.isRoomAdmin.mockResolvedValue(false)
    const ada = { userId: "ada", username: "Ada" }
    expect(await plugin.executeAction("chipIn", ada, { amount: 100 })).toEqual({
      success: true,
      message: "Thanks! 100 / 108 coins.",
    })
    expect(h.emitted.at(-1)).toMatchObject({ tripPool: { raised: 100 } })
    expect(await plugin.executeAction("chipIn", ada, { amount: 8 })).toEqual({
      success: true,
      message: "That covers it. Filling up!",
    })
    expect(h.wallets.ada).toBe(892)
    expect(h.emitted.at(-1)).toMatchObject({ tripPoolOpen: false, tripPool: null })
    expect(lastTrip(h).fuel.anchorGallons).toBe(15)
    expect(await plugin.executeAction("chipIn", ada, { amount: 1 })).toMatchObject({
      success: false,
    })
  })

  it("defers a skip poll around another poll, then applies the default", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
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
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
    await plugin.executeAction("depart", ADMIN)
    expect(
      (await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON }))
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
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
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

  it("reads costScale once, then follows economy change events", async () => {
    const { plugin, h } = await setup()
    const game = (h.context as unknown as { game: { getEconomyScale: Mock } }).game
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
    await plugin.executeAction("depart", ADMIN)
    await plugin.executeAction("pause", ADMIN)
    await plugin.executeAction("resume", ADMIN)
    expect(game.getEconomyScale).toHaveBeenCalledTimes(1)

    await h.fire("GAME_ECONOMY_SCALE_CHANGED", {
      roomId: "room-1",
      sessionId: "game-1",
      costScale: 2,
      earnScale: 1,
      previous: { costScale: 1, earnScale: 1 },
      updatedBy: "plugin",
    })
    await plugin.executeAction("pause", ADMIN)
    expect(lastTrip(h).costScale).toBe(2)
    expect(game.getEconomyScale).toHaveBeenCalledTimes(1)
  })

  it("keeps one ledger when mutations overlap (leg commits inside the CAS)", async () => {
    const { plugin, h } = await setup()
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
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
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
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
    await plugin.executeAction("loadMap", ADMIN, { mapJson: BASE_MAP_JSON })
    await plugin.executeAction("depart", ADMIN)
    h.api.schedule.mockClear()
    // Revealing a site changes state but no fire times.
    const reveal = Array.from(h.schedules.values()).find((s) => s.kind === "reveal")!
    vi.setSystemTime(reveal.at)
    h.schedules.delete(reveal.id)
    await plugin.handleScheduled(reveal.kind, reveal.payload, reveal.id)
    expect(h.api.schedule).not.toHaveBeenCalled()
  })

  describe("van and incidents (Phase 3)", () => {
    const FULL_MAP_JSON = JSON.stringify(SAMPLE_TRIP_MAP)
    const use = (plugin: RoadTripPlugin, userId: string, shortId: string) =>
      plugin.onItemUsed(
        userId,
        { itemId: "stack-1", definitionId: `road-trip:${shortId}` } as never,
        { id: `road-trip:${shortId}`, shortId, name: shortId } as never,
      )

    it("registers parts and consumables as items", async () => {
      const { h } = await setup()
      expect(h.registeredItems.map((d) => d.shortId)).toEqual([
        "aero-spoiler",
        "turbocharger",
        "road-grip-tires",
        "obnoxious-horn",
        "aaa-card",
        "fix-a-flat",
        "cb-radio",
      ])
    })

    it("installs a part on use and keeps items it can't use", async () => {
      const { plugin, h } = await setup()
      expect(await use(plugin, "ada", "turbocharger")).toMatchObject({
        success: false,
        consumed: false,
      })
      await plugin.executeAction("loadMap", ADMIN, { mapJson: FULL_MAP_JSON })
      expect(await use(plugin, "ada", "turbocharger")).toMatchObject({
        success: true,
        consumed: true,
      })
      expect(await use(plugin, "ada", "turbocharger")).toEqual({
        success: false,
        consumed: false,
        message: "The van already has a Turbocharger.",
      })
      expect(await use(plugin, "ada", "fix-a-flat")).toEqual({
        success: false,
        consumed: false,
        message: "Save it for a blown tire.",
      })
      expect(h.signs.map((s) => s.title)).toContain("ADA bolted on a turbocharger")
      expect(lastTrip(h).vanSheet.parts).toEqual([
        expect.objectContaining({ slot: "engine", partId: "turbocharger", installedBy: "ADA" }),
      ])
    })

    it("a scripted flat nudges Fix-a-Flat holders, and using one patches it", async () => {
      const { plugin, h } = await setup()
      h.holdings.ada = ["road-trip:fix-a-flat"]
      await plugin.executeAction("loadMap", ADMIN, {
        mapJson: JSON.stringify({ ...SAMPLE_TRIP_MAP, route: { ...SAMPLE_TRIP_MAP.route, tanksPerTrip: 0.8 } }),
      })
      await plugin.executeAction("depart", ADMIN)
      await runUntil(plugin, h, T0 + 13 * MIN + 5_000)
      expect(lastTrip(h).live).toMatchObject({ kind: "incident", incident: "blown-tire" })
      expect(h.schedules.has("incident:incident-1:0")).toBe(true)
      expect(h.api.sendUserSystemMessage).toHaveBeenCalledWith(
        "room-1",
        "ada",
        expect.stringContaining("Fix-a-Flat"),
        expect.objectContaining({ theme: "road-trip" }),
      )
      expect(h.api.sendUserSystemMessage).not.toHaveBeenCalledWith(
        "room-1",
        "host",
        expect.stringContaining("Fix-a-Flat"),
        expect.anything(),
      )
      expect(await use(plugin, "ada", "fix-a-flat")).toMatchObject({ success: true, consumed: true })
      expect(lastTrip(h).live).toBeUndefined()
      expect(h.schedules.has("incident:incident-1:0")).toBe(false)
    })

    it("host triggers an engine failure; skipping the tow fee refunds the levy; the tow can't be skipped", async () => {
      const { plugin, h } = await setup()
      await plugin.executeAction("loadMap", ADMIN, { mapJson: FULL_MAP_JSON })
      expect((await plugin.executeAction("triggerIncident", ADMIN, { incident: "engine-failure" })).success).toBe(false)
      await plugin.executeAction("depart", ADMIN)
      vi.setSystemTime(T0 + MIN)
      expect(
        await plugin.executeAction("triggerIncident", ADMIN, { incident: "out-of-gas" }),
      ).toMatchObject({ success: false })
      expect(
        await plugin.executeAction("triggerIncident", ADMIN, { incident: "engine-failure" }),
      ).toEqual({ success: true, message: "Engine failure!" })
      expect(lastTrip(h).live).toMatchObject({ kind: "fund", purpose: "tow", cost: 60 })
      expect(h.wallets).toEqual({ host: 95, ada: 945 })

      expect(await plugin.executeAction("skipIncidentStep", ADMIN)).toEqual({
        success: true,
        message: "Tow waived and refunded.",
      })
      expect(h.wallets).toEqual({ host: 100, ada: 1_000 })
      expect(lastTrip(h).vanSheet.incident).toMatchObject({ stepKind: "wait" })

      expect(await plugin.executeAction("skipIncidentStep", ADMIN)).toMatchObject({ success: true })
      expect(lastTrip(h).vanSheet.incident).toMatchObject({ stepKind: "tow" })
      expect(lastTrip(h).van.mph).toBe(45)
      expect(await plugin.executeAction("skipIncidentStep", ADMIN)).toEqual({
        success: false,
        message: "The tow can't be skipped.",
      })
      expect(Array.from(h.schedules.keys()).filter((id) => !id.startsWith("expire:"))).toEqual([
        "incident:incident-1:2",
      ])
    })

    it("never settles an automatic levy as 0 while it's still debiting", async () => {
      const { plugin, h } = await setup()
      await plugin.executeAction("loadMap", ADMIN, { mapJson: FULL_MAP_JSON })
      await plugin.executeAction("depart", ADMIN)
      vi.setSystemTime(T0 + MIN)
      type AddScore = (...args: unknown[]) => Promise<number>
      const game = (h.context as unknown as { game: { addScore: Mock<AddScore> } }).game
      const real = game.addScore.getMockImplementation()!
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      game.addScore.mockImplementationOnce(async (...args: unknown[]) => {
        await gate
        return real(...args)
      })
      const readFund = async () =>
        (await h.context.storage.getJson<{ fund?: Record<string, unknown> }>("trip:state")).value
          ?.fund
      const trigger = plugin.executeAction("triggerIncident", ADMIN, { incident: "engine-failure" })
      for (let i = 0; i < 200 && (await readFund())?.levyStartedAt === undefined; i++) {
        await Promise.resolve()
      }
      expect((await readFund())?.levyStartedAt).toBeDefined()

      // The session ends (and the hold runs out) while the first debit is still in flight.
      vi.setSystemTime(T0 + MIN + 30_000)
      await h.fire("GAME_SESSION_ENDED", { roomId: "room-1" })
      expect(await readFund()).toMatchObject({ purpose: "tow" })
      expect((await readFund())?.collected).toBeUndefined()

      release()
      await trigger
      expect(await readFund()).toMatchObject({ collected: 60 })
      expect(h.wallets).toEqual({ host: 95, ada: 945 })

      await runUntil(plugin, h, T0 + 2 * MIN)
      const log = (await h.context.storage.lrange("trip:log", 0, -1)).map((l) => JSON.parse(l))
      expect(log.find((e: { kind: string }) => e.kind === "fund")).toMatchObject({
        purpose: "tow",
        collected: 60,
      })
    })

    it("a host waive racing the pool deadline moves each coin exactly once", async () => {
      const { plugin, h } = await setup()
      await plugin.executeAction("loadMap", ADMIN, { mapJson: FULL_MAP_JSON })
      await plugin.executeAction("switchFundsMode", ADMIN)
      await plugin.executeAction("depart", ADMIN)
      vi.setSystemTime(T0 + MIN)
      await plugin.executeAction("triggerIncident", ADMIN, { incident: "engine-failure" })
      h.api.isRoomAdmin.mockResolvedValue(false)
      await plugin.executeAction("chipIn", { userId: "ada", username: "Ada" }, { amount: 30 })
      h.api.isRoomAdmin.mockResolvedValue(true)
      expect(h.wallets.ada).toBe(970)

      const expire = Array.from(h.schedules.values()).find((s) => s.id.startsWith("expire:fund"))!
      vi.setSystemTime(expire.at)
      h.schedules.delete(expire.id)
      const [waive] = await Promise.all([
        plugin.executeAction("skipIncidentStep", ADMIN),
        plugin.handleScheduled(expire.kind, expire.payload, expire.id),
      ])
      const log = (await h.context.storage.lrange("trip:log", 0, -1)).map((l) => JSON.parse(l))
      const fund = log.find((e: { kind: string }) => e.kind === "fund")
      if (waive.success) {
        expect(h.wallets.ada).toBe(1_000)
        expect(fund).toMatchObject({ waived: true })
      } else {
        expect(h.wallets.ada).toBe(970)
        expect(fund).toMatchObject({ collected: 30 })
      }
    })
  })
})

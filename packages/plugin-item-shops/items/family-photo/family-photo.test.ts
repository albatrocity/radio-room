import { describe, expect, it, vi, beforeEach } from "vitest"
import { familyPhoto } from "./index"
import { createMockDeps, createMockDefinition } from "../shared/testHelpers"
import { FAMILY_PHOTO_MAX_DEPTH } from "./constants"
import {
  FAMILY_PHOTO_SONS_STORAGE_KEY,
  SonRegistry,
  type SonSpawnRecord,
} from "../../helpers/sonRegistry"

describe("familyPhoto item", () => {
  it("is legendary and consumable", () => {
    expect(familyPhoto.catalogEntry.definition.rarity).toBe("legendary")
    expect(familyPhoto.catalogEntry.definition.consumable).toBe(true)
    expect(familyPhoto.catalogEntry.definition.name).toBe("Family Photo")
    expect(familyPhoto.use).toBeDefined()
  })

  it("fails when sonAccess is absent", async () => {
    const deps = createMockDeps()
    const result = await familyPhoto.use!(deps, "u1", createMockDefinition("family-photo"))
    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toMatch(/unavailable/i)
  })

  it("spawns a son via sonAccess", async () => {
    const spawn = vi.fn().mockResolvedValue({
      success: true,
      consumed: true,
      message: "ok",
    })
    const deps = createMockDeps({
      sonAccess: { spawnSonForUser: spawn },
    })
    const result = await familyPhoto.use!(deps, "u1", createMockDefinition("family-photo"))
    expect(spawn).toHaveBeenCalledWith("u1")
    expect(result.success).toBe(true)
    expect(result.consumed).toBe(true)
  })
})

describe("SonRegistry", () => {
  const scheduleApi = {
    scheduleDespawn: vi.fn().mockResolvedValue({ ok: true, fireAt: Date.now() + 600_000 }),
    cancelDespawn: vi.fn().mockResolvedValue(true),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeStorage(initial: SonSpawnRecord[] | null = null) {
    let stored: SonSpawnRecord[] | null = initial
    return {
      getJson: vi.fn(async () => ({
        raw: stored ? JSON.stringify(stored) : null,
        value: stored,
      })),
      setJson: vi.fn(async (_key: string, value: unknown) => {
        stored = value as SonSpawnRecord[]
      }),
      getStored: () => stored,
    }
  }

  function makeApi(parent: { userId: string; username: string }, sonUserId = "s1") {
    return {
      getUsers: vi.fn().mockResolvedValue([parent]),
      getUsersByIds: vi.fn().mockResolvedValue([parent]),
      spawnEphemeralUser: vi.fn().mockResolvedValue({
        userId: sonUserId,
        username: `${parent.username}'s son`,
      }),
      despawnEphemeralUser: vi.fn(),
      sendSystemMessage: vi.fn(),
      sendChatMessageAsUser: vi.fn(),
      addReactionAsUser: vi.fn(),
      removeReactionAsUser: vi.fn(),
    }
  }

  it("spawns son with persona, persists graph, and schedules despawn", async () => {
    const parent = { userId: "p1", username: "Ross" }
    const api = makeApi(parent)
    const storage = makeStorage()
    const personas = {
      assign: vi.fn(),
      remove: vi.fn(),
      getUsersWithPersona: vi.fn().mockResolvedValue([]),
    }
    const game = {
      addScore: vi.fn(),
      getPresentedIdentity: vi.fn().mockResolvedValue(null),
      getUserState: vi.fn().mockResolvedValue(null),
    }
    const inventory = {
      giveItem: vi.fn(),
      getInventory: vi.fn().mockResolvedValue({ items: [] }),
      useItem: vi.fn(),
    }

    const registry = new SonRegistry(
      () =>
        ({
          roomId: "room-1",
          api,
          personas,
          game,
          inventory,
          storage,
        }) as any,
      scheduleApi,
      "item-shops",
    )

    const first = await registry.spawnSonForUser("p1")
    expect(first.success).toBe(true)
    expect(first.consumed).toBe(true)
    expect(api.spawnEphemeralUser).toHaveBeenCalledWith("room-1", { username: "Ross's son" })
    expect(personas.assign).toHaveBeenCalledWith("s1", "son", "item-shops")
    expect(scheduleApi.scheduleDespawn).toHaveBeenCalledWith("s1", expect.any(Number))
    expect(storage.setJson).toHaveBeenCalledWith(
      FAMILY_PHOTO_SONS_STORAGE_KEY,
      expect.arrayContaining([
        expect.objectContaining({ sonUserId: "s1", parentUserId: "p1", depth: 1 }),
      ]),
    )
    expect(api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      "Ross brought their son into the picture.",
    )
    expect(first.message).toBe("Ross's son is in the picture for 10 minutes.")
    expect(registry.getChildUserIds("p1")).toEqual(["s1"])

    // Manually deepen to max by spawning from nested usernames
    let currentParentId = "s1"
    let currentUsername = "Ross's son"
    for (let depth = 2; depth <= FAMILY_PHOTO_MAX_DEPTH; depth++) {
      const nextId = `s${depth}`
      const nextName = `${currentUsername}'s son`
      api.getUsers.mockResolvedValue([{ userId: currentParentId, username: currentUsername }])
      api.getUsersByIds.mockResolvedValue([{ userId: currentParentId, username: currentUsername }])
      api.spawnEphemeralUser.mockResolvedValue({ userId: nextId, username: nextName })
      const r = await registry.spawnSonForUser(currentParentId)
      expect(r.success).toBe(true)
      currentParentId = nextId
      currentUsername = nextName
    }

    api.getUsers.mockResolvedValue([
      { userId: currentParentId, username: currentUsername },
    ])
    const blocked = await registry.spawnSonForUser(currentParentId)
    expect(blocked.success).toBe(false)
    expect(blocked.message).toMatch(/deeper/i)
  })

  it("announces spawn with presented-identity label when parent is masked", async () => {
    const parent = { userId: "p1", username: "Ross" }
    const api = makeApi(parent)
    const storage = makeStorage()
    const game = {
      addScore: vi.fn(),
      getPresentedIdentity: vi.fn().mockResolvedValue({
        userId: "p1",
        label: "Someone",
        engaged: true,
        toggleable: true,
        expiresAt: Date.now() + 60_000,
        source: "disguise",
        sessionId: "sess-1",
      }),
      getUserState: vi.fn().mockResolvedValue(null),
    }
    const registry = new SonRegistry(
      () =>
        ({
          roomId: "room-1",
          api,
          personas: {
            assign: vi.fn(),
            remove: vi.fn(),
            getUsersWithPersona: vi.fn().mockResolvedValue([]),
          },
          game,
          inventory: {},
          storage,
        }) as any,
      scheduleApi,
      "item-shops",
    )

    await registry.spawnSonForUser("p1")
    expect(api.sendSystemMessage).toHaveBeenCalledWith(
      "room-1",
      "Someone brought their son into the picture.",
      expect.objectContaining({
        maskedUserIds: ["p1"],
        maskedLabel: "Someone",
      }),
    )
  })

  it("funnels positive score to parent and ignores funnel reasons", async () => {
    const parent = { userId: "p1", username: "Ross" }
    const api = makeApi(parent)
    const storage = makeStorage()
    const game = {
      addScore: vi.fn(),
      getPresentedIdentity: vi.fn().mockResolvedValue(null),
      getUserState: vi.fn().mockResolvedValue(null),
    }
    const registry = new SonRegistry(
      () =>
        ({
          roomId: "room-1",
          api,
          personas: {
            assign: vi.fn(),
            remove: vi.fn(),
            getUsersWithPersona: vi.fn().mockResolvedValue([]),
          },
          game,
          inventory: {},
          storage,
        }) as any,
      scheduleApi,
      "item-shops",
    )
    await registry.spawnSonForUser("p1")

    await registry.funnelScore({
      sonUserId: "s1",
      attribute: "coin",
      previousValue: 0,
      value: 10,
      reason: "playlist-bingo",
    })
    expect(game.addScore).toHaveBeenCalledWith("p1", "coin", 10, "item-shops:son-funnel", {
      intent: "exact",
    })
    expect(game.addScore).toHaveBeenCalledWith("s1", "coin", -10, "item-shops:son-funnel-clawback", {
      intent: "exact",
    })

    game.addScore.mockClear()
    await registry.funnelScore({
      sonUserId: "s1",
      attribute: "coin",
      previousValue: 10,
      value: 20,
      reason: "item-shops:son-funnel",
    })
    expect(game.addScore).not.toHaveBeenCalled()
  })

  it("mirrors chat to children", async () => {
    const parent = { userId: "p1", username: "Ross" }
    const api = makeApi(parent)
    const storage = makeStorage()
    const registry = new SonRegistry(
      () =>
        ({
          roomId: "room-1",
          api,
          personas: {
            assign: vi.fn(),
            remove: vi.fn(),
            getUsersWithPersona: vi.fn().mockResolvedValue([]),
          },
          game: {
            getPresentedIdentity: vi.fn().mockResolvedValue(null),
            getUserState: vi.fn().mockResolvedValue(null),
          },
          inventory: {},
          storage,
        }) as any,
      scheduleApi,
      "item-shops",
    )
    await registry.spawnSonForUser("p1")
    await registry.mirrorChat("p1", "hello")
    expect(api.sendChatMessageAsUser).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(api.sendChatMessageAsUser).mock.calls[0]!
    expect(sent[0]).toBe("room-1")
    expect(sent[1]).toBe("s1")
    expect(sent[2]).toContain("hello")
    expect(sent[2]).not.toBe("hello")
  })

  it("reconcileOnRegister despawns due records without rescheduling them", async () => {
    const now = Date.now()
    const due: SonSpawnRecord = {
      sonUserId: "s-due",
      parentUserId: "p1",
      depth: 1,
      expiresAt: now - 5_000,
    }
    const living: SonSpawnRecord = {
      sonUserId: "s-live",
      parentUserId: "p1",
      depth: 1,
      expiresAt: now + 300_000,
    }
    const storage = makeStorage([due, living])
    const api = {
      getUsers: vi.fn(),
      getUsersByIds: vi.fn(),
      spawnEphemeralUser: vi.fn(),
      despawnEphemeralUser: vi.fn(),
      sendSystemMessage: vi.fn(),
    }
    const personas = {
      assign: vi.fn(),
      remove: vi.fn(),
      getUsersWithPersona: vi.fn().mockResolvedValue(["s-live"]),
    }
    const registry = new SonRegistry(
      () =>
        ({
          roomId: "room-1",
          api,
          personas,
          game: {},
          inventory: {},
          storage,
        }) as any,
      scheduleApi,
      "item-shops",
    )

    await registry.reconcileOnRegister(now)

    expect(api.despawnEphemeralUser).toHaveBeenCalledWith("room-1", "s-due")
    expect(personas.remove).toHaveBeenCalledWith("s-due", "son")
    expect(registry.isSon("s-due")).toBe(false)
    expect(registry.isSon("s-live")).toBe(true)
    expect(scheduleApi.scheduleDespawn).toHaveBeenCalledWith("s-live", expect.any(Number))
    expect(scheduleApi.scheduleDespawn).not.toHaveBeenCalledWith("s-due", expect.anything())
  })

  it("reconcileOnRegister despawns orphan persona holders missing from the graph", async () => {
    const storage = makeStorage([])
    const api = {
      despawnEphemeralUser: vi.fn(),
    }
    const personas = {
      remove: vi.fn(),
      getUsersWithPersona: vi.fn().mockResolvedValue(["orphan-1"]),
    }
    const registry = new SonRegistry(
      () =>
        ({
          roomId: "room-1",
          api,
          personas,
          game: {},
          inventory: {},
          storage,
        }) as any,
      scheduleApi,
      "item-shops",
    )

    await registry.reconcileOnRegister()

    expect(personas.remove).toHaveBeenCalledWith("orphan-1", "son")
    expect(api.despawnEphemeralUser).toHaveBeenCalledWith("room-1", "orphan-1")
  })
})

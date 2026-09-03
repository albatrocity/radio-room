import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AppContext, PresentedIdentityGrant } from "@repo/types"
import { grantPresentedIdentity } from "./grantPresentedIdentity"
import { getPresentedIdentity } from "./getPresentedIdentity"
import { setPresentedIdentityEngaged } from "./setPresentedIdentityEngaged"
import { presentedIdentityIndexKey, presentedIdentityKey } from "./keys"

function createRedis() {
  const store = new Map<string, string>()
  const sets = new Map<string, Set<string>>()
  return {
    store,
    sets,
    pubClient: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value)
      }),
      del: vi.fn(async (key: string) => {
        store.delete(key)
      }),
      sMembers: vi.fn(async (key: string) => Array.from(sets.get(key) ?? [])),
      multi: vi.fn(() => {
        const ops: Array<() => void> = []
        const api = {
          set: (key: string, value: string, _opts?: { EX?: number }) => {
            ops.push(() => store.set(key, value))
            return api
          },
          sAdd: (key: string, member: string) => {
            ops.push(() => {
              if (!sets.has(key)) sets.set(key, new Set())
              sets.get(key)!.add(member)
            })
            return api
          },
          del: (key: string) => {
            ops.push(() => store.delete(key))
            return api
          },
          sRem: (key: string, member: string) => {
            ops.push(() => sets.get(key)?.delete(member))
            return api
          },
          exec: async () => {
            for (const op of ops) op()
            return []
          },
        }
        return api
      }),
    },
  }
}

describe("presentedIdentity ops", () => {
  let redis: ReturnType<typeof createRedis>
  let context: AppContext

  beforeEach(() => {
    redis = createRedis()
    context = {
      redis: redis as any,
      adapters: {} as any,
      jobs: [],
      gameSessions: {
        getActiveSession: vi.fn().mockResolvedValue({ id: "session-1", status: "active" }),
      },
      systemEvents: {
        emit: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as AppContext
  })

  it("round-trips the modifier binding used by core to clear the grant (ADR 0150)", async () => {
    const granted = await grantPresentedIdentity({
      context,
      roomId: "room-1",
      input: {
        userId: "u1",
        label: "Somebody",
        toggleable: true,
        durationMs: 60_000,
        source: "item-shops:disguise",
        modifierId: "mod-9",
      },
    })
    expect(granted?.modifierId).toBe("mod-9")

    // Core matches on this field alone — it must survive the Redis round-trip.
    const loaded = await getPresentedIdentity({ context, roomId: "room-1", userId: "u1" })
    expect(loaded?.modifierId).toBe("mod-9")
  })

  it("omits modifierId when the grant is not bound to a modifier", async () => {
    const granted = await grantPresentedIdentity({
      context,
      roomId: "room-1",
      input: {
        userId: "u2",
        label: "Somebody",
        toggleable: false,
        durationMs: 60_000,
        source: "some-plugin",
      },
    })
    expect(granted?.modifierId).toBeUndefined()
    const loaded = await getPresentedIdentity({ context, roomId: "room-1", userId: "u2" })
    expect(loaded?.modifierId).toBeUndefined()
  })

  it("grants, engages, and rejects non-toggleable engage", async () => {
    const granted = await grantPresentedIdentity({
      context,
      roomId: "room-1",
      input: {
        userId: "u1",
        label: "Someone",
        toggleable: true,
        engaged: true,
        durationMs: 60_000,
        source: "item-shops:disguise",
      },
    })
    expect(granted?.label).toBe("Someone")
    expect(redis.store.has(presentedIdentityKey("room-1", "u1"))).toBe(true)
    expect(redis.sets.get(presentedIdentityIndexKey("room-1"))?.has("u1")).toBe(true)

    const engagedOff = await setPresentedIdentityEngaged({
      context,
      roomId: "room-1",
      userId: "u1",
      engaged: false,
    })
    expect(engagedOff.ok).toBe(true)
    if (engagedOff.ok) expect(engagedOff.grant.engaged).toBe(false)

    const fetched = await getPresentedIdentity({ context, roomId: "room-1", userId: "u1" })
    expect(fetched?.engaged).toBe(false)

    // Replace with non-toggleable
    await grantPresentedIdentity({
      context,
      roomId: "room-1",
      input: {
        userId: "u1",
        label: "Wolf",
        toggleable: false,
        durationMs: 60_000,
        source: "werewolf",
      },
    })
    const rejected = await setPresentedIdentityEngaged({
      context,
      roomId: "room-1",
      userId: "u1",
      engaged: false,
    })
    expect(rejected).toEqual({ ok: false, reason: "not_toggleable" })
  })

  it("returns null for expired grants and deletes the key", async () => {
    const expired: PresentedIdentityGrant = {
      userId: "u1",
      label: "Someone",
      engaged: true,
      toggleable: true,
      expiresAt: Date.now() - 1000,
      source: "item-shops:disguise",
      sessionId: "session-1",
    }
    redis.store.set(presentedIdentityKey("room-1", "u1"), JSON.stringify(expired))
    redis.sets.set(presentedIdentityIndexKey("room-1"), new Set(["u1"]))

    const fetched = await getPresentedIdentity({ context, roomId: "room-1", userId: "u1" })
    expect(fetched).toBeNull()
  })
})

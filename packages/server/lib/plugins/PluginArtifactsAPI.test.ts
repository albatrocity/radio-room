import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, StoredArtifact } from "@repo/types"
import { PluginArtifactsAPI } from "./PluginArtifactsAPI"
import { STASH_ACCESS_GRANT_TTL_MS } from "@repo/game-logic"

const CREATED_AT = 1_700_000_000_000
const REDIS_KEY = "global:storedArtifacts"

/** Single-hash stub for `global:storedArtifacts` plus the lock key. */
function makeApi() {
  const hash = new Map<string, string>()
  const accessHashes = new Map<string, Map<string, string>>()
  const pubClient = {
    hSet: vi.fn(async (key: string, field: string, raw: string) => {
      if (key === REDIS_KEY) {
        hash.set(field, raw)
      } else {
        let map = accessHashes.get(key)
        if (!map) {
          map = new Map()
          accessHashes.set(key, map)
        }
        map.set(field, raw)
      }
      return 1
    }),
    hGet: vi.fn(async (key: string, field: string) => {
      if (key === REDIS_KEY) return hash.get(field) ?? null
      return accessHashes.get(key)?.get(field) ?? null
    }),
    hGetAll: vi.fn(async (key?: string) => {
      if (key && key !== REDIS_KEY) {
        const map = accessHashes.get(key)
        return map ? Object.fromEntries(map) : {}
      }
      return Object.fromEntries(hash)
    }),
    hDel: vi.fn(async (key: string, field: string) => {
      if (key === REDIS_KEY) return hash.delete(field) ? 1 : 0
      return accessHashes.get(key)?.delete(field) ? 1 : 0
    }),
    expire: vi.fn(async () => true),
    set: vi.fn(async () => "OK"),
    get: vi.fn(async () => null),
    del: vi.fn(async () => 1),
  }
  const api = new PluginArtifactsAPI({ redis: { pubClient } } as unknown as AppContext)
  const read = (id: string): StoredArtifact => JSON.parse(hash.get(id)!) as StoredArtifact
  return { api, read, pubClient, key: REDIS_KEY, accessHashes }
}

function storeInput() {
  return {
    storingPlugin: "item-shops",
    storingItemId: "road-case",
    artifactType: "item" as const,
    containerDefinitionId: "item-shops:road-case",
    contents: [
      {
        kind: "item" as const,
        itemDefinitionId: "item-shops:mars-egg",
        itemName: "Mars Egg",
        itemQuantity: 1,
      },
    ],
    storedAt: CREATED_AT,
    storedByUserId: "u1",
    storedByUsername: "Ross",
    password: "eggsonmars",
  }
}

describe("PluginArtifactsAPI lastTouchedAt", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(CREATED_AT)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("store stamps the create as the first touch", async () => {
    const { api, read } = makeApi()
    const id = await api.store(storeInput())
    expect(read(id).lastTouchedAt).toBe(CREATED_AT)
  })

  test("update stamps a deposit or withdraw", async () => {
    const { api, read } = makeApi()
    const id = await api.store(storeInput())

    vi.setSystemTime(CREATED_AT + 60_000)
    await api.update(id, { contents: [] })
    expect(read(id).lastTouchedAt).toBe(CREATED_AT + 60_000)
    expect(read(id).storedAt).toBe(CREATED_AT)
  })

  test("a wrong-password attempt does not count as a touch", async () => {
    const { api, read } = makeApi()
    const id = await api.store(storeInput())

    vi.setSystemTime(CREATED_AT + 60_000)
    expect(await api.attemptRetrieve(id, "not-the-password")).toEqual({ status: "wrong_password" })
    expect(read(id).lastTouchedAt).toBe(CREATED_AT)
  })

  test("a correct password alone does not count — only the completed write does", async () => {
    const { api, read } = makeApi()
    const id = await api.store(storeInput())

    vi.setSystemTime(CREATED_AT + 60_000)
    const attempt = await api.attemptRetrieve(id, "eggsonmars")
    expect(attempt.status).toBe("success")
    expect(read(id).lastTouchedAt).toBe(CREATED_AT)
  })

  test("callers cannot backdate the clock through the patch", async () => {
    const { api, read } = makeApi()
    const id = await api.store(storeInput())

    vi.setSystemTime(CREATED_AT + 60_000)
    await api.update(id, { lastTouchedAt: 1 } as never)
    expect(read(id).lastTouchedAt).toBe(CREATED_AT + 60_000)
  })
})

describe("PluginArtifactsAPI getAll listing", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(CREATED_AT)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function storeWithMetadata() {
    return {
      ...storeInput(),
      contents: [
        {
          kind: "item" as const,
          itemDefinitionId: "item-shops:tour-laminate",
          itemName: "Tour Laminate",
          itemQuantity: 1,
          metadata: { punches: [{ at: CREATED_AT }] },
        },
      ],
    }
  }

  test("omits password and item stack metadata from listing rows", async () => {
    const { api } = makeApi()
    const id = await api.store(storeWithMetadata())
    const [row] = await api.getAll()
    expect(row?.id).toBe(id)
    expect(row).not.toHaveProperty("password")
    const item = row?.contents?.[0]
    expect(item).toMatchObject({
      kind: "item",
      itemDefinitionId: "item-shops:tour-laminate",
      itemName: "Tour Laminate",
      itemQuantity: 1,
    })
    expect(item).not.toHaveProperty("metadata")
  })

  test("attemptRetrieve still returns stack metadata from Redis", async () => {
    const { api, read } = makeApi()
    const id = await api.store(storeWithMetadata())
    const redisItem = read(id).contents?.[0]
    expect(redisItem).toMatchObject({
      kind: "item",
      metadata: { punches: [{ at: CREATED_AT }] },
    })

    const attempt = await api.attemptRetrieve(id, "eggsonmars")
    expect(attempt.status).toBe("success")
    if (attempt.status !== "success") return
    expect(attempt.artifact.contents?.[0]).toMatchObject({
      kind: "item",
      metadata: { punches: [{ at: CREATED_AT }] },
    })
  })
})

describe("PluginArtifactsAPI access grants", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(CREATED_AT)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("grantAccess writes field and sets key TTL", async () => {
    const { api, pubClient } = makeApi()
    const id = await api.store(storeInput())
    const grant = await api.grantAccess({
      artifactId: id,
      userId: "u1",
      source: "lock-pick",
      roomId: "room1",
    })
    expect(grant).toMatchObject({
      artifactId: id,
      userId: "u1",
      source: "lock-pick",
      roomId: "room1",
      issuedAt: CREATED_AT,
      expiresAt: CREATED_AT + STASH_ACCESS_GRANT_TTL_MS,
    })
    expect(pubClient.expire).toHaveBeenCalledWith(`${REDIS_KEY}:access:u1`, 600)
  })

  test("grantAccess on missing artifact returns null", async () => {
    const { api } = makeApi()
    expect(
      await api.grantAccess({ artifactId: "missing", userId: "u1", source: "lock-pick" }),
    ).toBeNull()
  })

  test("listAccessGrants filters expired", async () => {
    const { api } = makeApi()
    const id = await api.store(storeInput())
    await api.grantAccess({ artifactId: id, userId: "u1", source: "lock-pick", ttlMs: 1000 })
    vi.setSystemTime(CREATED_AT + 2000)
    expect(await api.listAccessGrants("u1")).toEqual([])
  })

  test("attemptRetrieveWithGrant returns not_found / success / no_grant", async () => {
    const { api } = makeApi()
    expect(await api.attemptRetrieveWithGrant("missing", "u1")).toEqual({ status: "no_grant" })

    const id = await api.store(storeInput())
    expect(await api.attemptRetrieveWithGrant(id, "u1")).toEqual({ status: "no_grant" })

    await api.grantAccess({ artifactId: id, userId: "u1", source: "lock-pick" })
    const attempt = await api.attemptRetrieveWithGrant(id, "u1")
    expect(attempt.status).toBe("success")
  })

  test("revokeAccessGrant false when absent", async () => {
    const { api } = makeApi()
    expect(await api.revokeAccessGrant("a", "u1")).toBe(false)
  })
})

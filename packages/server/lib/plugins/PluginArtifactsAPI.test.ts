import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext, StoredArtifact } from "@repo/types"
import { PluginArtifactsAPI } from "./PluginArtifactsAPI"

const CREATED_AT = 1_700_000_000_000
const REDIS_KEY = "global:storedArtifacts"

/** Single-hash stub for `global:storedArtifacts` plus the lock key. */
function makeApi() {
  const hash = new Map<string, string>()
  const pubClient = {
    hSet: vi.fn(async (_key: string, field: string, raw: string) => {
      hash.set(field, raw)
      return 1
    }),
    hGet: vi.fn(async (_key: string, field: string) => hash.get(field) ?? null),
    hGetAll: vi.fn(async () => Object.fromEntries(hash)),
    hDel: vi.fn(async (_key: string, field: string) => (hash.delete(field) ? 1 : 0)),
    set: vi.fn(async () => "OK"),
    get: vi.fn(async () => null),
    del: vi.fn(async () => 1),
  }
  const api = new PluginArtifactsAPI({ redis: { pubClient } } as unknown as AppContext)
  const read = (id: string): StoredArtifact => JSON.parse(hash.get(id)!) as StoredArtifact
  return { api, read, pubClient, key: REDIS_KEY }
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

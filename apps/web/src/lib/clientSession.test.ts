import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SESSION_ID, SESSION_USERNAME } from "../constants"
import {
  clearStoredUser,
  getStoredUserId,
  setStoredUserId,
} from "./clientSession"

function createStorageMock(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

describe("clientSession", () => {
  let local: Storage
  let session: Storage

  beforeEach(() => {
    local = createStorageMock()
    session = createStorageMock()
    vi.stubGlobal("localStorage", local)
    vi.stubGlobal("sessionStorage", session)
    vi.stubGlobal("window", {} as Window)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns localStorage value when both stores are set", () => {
    session.setItem(SESSION_ID, "legacy-id")
    local.setItem(SESSION_ID, "local-id")

    expect(getStoredUserId()).toBe("local-id")
  })

  it("returns sessionStorage value when only sessionStorage is set", () => {
    session.setItem(SESSION_ID, "legacy-id")

    expect(getStoredUserId()).toBe("legacy-id")
    expect(local.getItem(SESSION_ID)).toBeNull()
  })

  it("writes to localStorage and removes matching sessionStorage entry on set", () => {
    session.setItem(SESSION_ID, "legacy-id")

    setStoredUserId("migrated-id")

    expect(local.getItem(SESSION_ID)).toBe("migrated-id")
    expect(session.getItem(SESSION_ID)).toBeNull()
  })

  it("clearStoredUser wipes both stores for userId and username", () => {
    local.setItem(SESSION_ID, "user-1")
    local.setItem(SESSION_USERNAME, "DJ")
    session.setItem(SESSION_ID, "user-2")
    session.setItem(SESSION_USERNAME, "Other")

    clearStoredUser()

    expect(local.getItem(SESSION_ID)).toBeNull()
    expect(local.getItem(SESSION_USERNAME)).toBeNull()
    expect(session.getItem(SESSION_ID)).toBeNull()
    expect(session.getItem(SESSION_USERNAME)).toBeNull()
  })

  it("no-ops read/write/clear when window is undefined", async () => {
    vi.stubGlobal("window", undefined)
    vi.resetModules()

    const { getStoredUserId: getId, setStoredUserId: setId, clearStoredUser: clear } =
      await import("./clientSession")

    expect(getId()).toBeNull()
    expect(() => setId("x")).not.toThrow()
    expect(() => clear()).not.toThrow()

    vi.unstubAllGlobals()
    vi.resetModules()
  })
})

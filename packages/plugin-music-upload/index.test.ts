import { describe, expect, it, vi, beforeEach } from "vitest"
import type { PluginContext } from "@repo/types"
import { MusicUploadPlugin } from "./index"
import { UPLOADER_PERSONA_ID, UPLOADING_USERS_KEY } from "./types"

function createMockContext() {
  const storageMap = new Map<string, string>()
  const lifecycleHandlers = new Map<string, Function[]>()

  const context = {
    roomId: "room-1",
    storage: {
      get: vi.fn(async (key: string) => storageMap.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        storageMap.set(key, value)
      }),
      del: vi.fn(async (key: string) => {
        storageMap.delete(key)
      }),
    },
    lifecycle: {
      on: vi.fn((event: string, handler: Function) => {
        const list = lifecycleHandlers.get(event) ?? []
        list.push(handler)
        lifecycleHandlers.set(event, list)
      }),
      off: vi.fn(),
    },
    api: {
      emit: vi.fn(),
      getPluginConfig: vi.fn().mockResolvedValue({ enabled: true }),
      getUsers: vi.fn().mockResolvedValue([]),
      sendSystemMessage: vi.fn(),
    },
    personas: {
      registerPersonas: vi.fn(),
      unregisterPersonas: vi.fn(),
      getUsersWithPersona: vi.fn().mockResolvedValue(["user-a"]),
      assign: vi.fn(),
      remove: vi.fn(),
    },
  } as unknown as PluginContext

  return { context, storageMap, lifecycleHandlers }
}

describe("MusicUploadPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("registers uploader persona on register", async () => {
    const plugin = new MusicUploadPlugin()
    const { context } = createMockContext()
    await plugin.register(context)

    expect(context.personas.registerPersonas).toHaveBeenCalledWith([
      expect.objectContaining({ id: UPLOADER_PERSONA_ID, assignableByAdmin: true }),
    ])
  })

  it("getComponentState returns uploader and uploading ids", async () => {
    const plugin = new MusicUploadPlugin()
    const { context, storageMap } = createMockContext()
    storageMap.set(UPLOADING_USERS_KEY, JSON.stringify(["user-b"]))
    await plugin.register(context)

    const state = await plugin.getComponentState()
    expect(state.uploaderUserIds).toEqual(["user-a"])
    expect(state.uploadingUserIds).toEqual(["user-b"])
  })

  it("round-trips uploading ids through string storage", async () => {
    const plugin = new MusicUploadPlugin()
    const { context, storageMap, lifecycleHandlers } = createMockContext()
    await plugin.register(context)

    const [onStarted] = lifecycleHandlers.get("MUSIC_UPLOAD_STARTED") ?? []
    await onStarted?.({ roomId: "room-1", userId: "user-c" })

    expect(storageMap.get(UPLOADING_USERS_KEY)).toBe(JSON.stringify(["user-c"]))
    expect((await plugin.getComponentState()).uploadingUserIds).toEqual(["user-c"])
  })
})

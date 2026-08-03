import { beforeEach, describe, expect, test, vi } from "vitest"
import { MetadataSourceAccessService } from "./MetadataSourceAccessService"
import { findRoom, isRoomAdmin } from "../operations/data"

vi.mock("../operations/data", () => ({
  findRoom: vi.fn(),
  isRoomAdmin: vi.fn(),
}))

vi.mock("@repo/adapter-bridge", () => ({
  getOrCreateCapabilityCache: () => ({
    start: vi.fn().mockResolvedValue(undefined),
    isConnected: () => true,
    hasReceivedCapabilities: () => true,
    getAvailableServices: () => ["spotify", "youtube", "local", "tidal"],
  }),
}))

describe("MetadataSourceAccessService", () => {
  const roomId = "room1"
  const userId = "user1"
  let service: MetadataSourceAccessService
  let grantMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    grantMock = vi.fn().mockResolvedValue(false)
    service = new MetadataSourceAccessService({
      pluginRegistry: { grantMetadataSourceAccess: grantMock },
      redis: { pubClient: {}, subClient: {} },
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
    } as any)
  })

  test("non-bridge room allows any enabled source", async () => {
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "admin",
      playbackControllerId: "spotify",
      metadataSourceIds: ["spotify"],
      metadataSourceAccess: { spotify: "restricted" },
    } as any)
    vi.mocked(isRoomAdmin).mockResolvedValue(false)

    await expect(
      service.canAccess({ roomId, userId, sourceId: "spotify", action: "search" }),
    ).resolves.toBe(true)
    expect(grantMock).not.toHaveBeenCalled()
  })

  test("admin bypasses restricted sources on bridge", async () => {
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "admin",
      playbackControllerId: "bridge",
      metadataSourceIds: ["spotify", "youtube"],
      metadataSourceAccess: { spotify: "open", youtube: "restricted" },
    } as any)
    vi.mocked(isRoomAdmin).mockResolvedValue(true)

    await expect(
      service.canAccess({ roomId, userId, sourceId: "youtube", action: "queue" }),
    ).resolves.toBe(true)
    expect(grantMock).not.toHaveBeenCalled()
  })

  test("restricted source denied without grant", async () => {
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "admin",
      playbackControllerId: "bridge",
      metadataSourceIds: ["spotify", "youtube"],
      metadataSourceAccess: { spotify: "open", youtube: "restricted" },
    } as any)
    vi.mocked(isRoomAdmin).mockResolvedValue(false)
    grantMock.mockResolvedValue(false)

    await expect(
      service.canAccess({ roomId, userId, sourceId: "youtube", action: "search" }),
    ).resolves.toBe(false)
  })

  test("restricted source allowed when plugin grants", async () => {
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "admin",
      playbackControllerId: "bridge",
      metadataSourceIds: ["spotify", "youtube"],
      metadataSourceAccess: { spotify: "open", youtube: "restricted" },
    } as any)
    vi.mocked(isRoomAdmin).mockResolvedValue(false)
    grantMock.mockResolvedValue(true)

    await expect(
      service.canAccess({ roomId, userId, sourceId: "youtube", action: "queue" }),
    ).resolves.toBe(true)
    expect(grantMock).toHaveBeenCalledWith({
      roomId,
      userId,
      sourceId: "youtube",
      action: "queue",
    })
  })

  test("open source allowed without grant", async () => {
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "admin",
      playbackControllerId: "bridge",
      metadataSourceIds: ["spotify", "youtube"],
      metadataSourceAccess: { spotify: "open", youtube: "restricted" },
    } as any)
    vi.mocked(isRoomAdmin).mockResolvedValue(false)

    await expect(
      service.canAccess({ roomId, userId, sourceId: "spotify", action: "search" }),
    ).resolves.toBe(true)
    expect(grantMock).not.toHaveBeenCalled()
  })

  test("getEffectiveSourceIdsForUser filters restricted without grant", async () => {
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "admin",
      playbackControllerId: "bridge",
      metadataSourceIds: ["spotify", "youtube", "local"],
      metadataSourceAccess: {
        spotify: "open",
        youtube: "restricted",
        local: "restricted",
      },
    } as any)
    vi.mocked(isRoomAdmin).mockResolvedValue(false)
    grantMock.mockResolvedValue(false)

    await expect(service.getEffectiveSourceIdsForUser(roomId, userId, "search")).resolves.toEqual([
      "spotify",
    ])
  })

  test("listMetadataSources returns labeled catalog", async () => {
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "admin",
      playbackControllerId: "bridge",
      metadataSourceIds: ["spotify", "youtube", "local"],
    } as any)

    await expect(service.listMetadataSources(roomId)).resolves.toEqual([
      { id: "spotify", label: "Spotify" },
      { id: "youtube", label: "YouTube" },
      { id: "local", label: "Library (local)" },
    ])
  })
})


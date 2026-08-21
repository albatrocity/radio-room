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

  test("getEffectiveSourceIdsForUser reads the room and admin status once, not once per source", async () => {
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "admin",
      playbackControllerId: "bridge",
      metadataSourceIds: ["spotify", "youtube", "local", "tidal"],
      metadataSourceAccess: { youtube: "restricted", local: "restricted" },
    } as any)
    vi.mocked(isRoomAdmin).mockResolvedValue(false)
    grantMock.mockResolvedValue(false)

    await expect(service.getEffectiveSourceIdsForUser(roomId, userId, "search")).resolves.toEqual([
      "spotify",
      "tidal",
    ])
    expect(findRoom).toHaveBeenCalledTimes(1)
    expect(isRoomAdmin).toHaveBeenCalledTimes(1)
  })

  test("getEffectiveSourceIdsForUser skips the room read when the caller supplies the room", async () => {
    const room = {
      id: roomId,
      creator: "admin",
      playbackControllerId: "spotify",
      metadataSourceIds: ["spotify"],
    } as any
    vi.mocked(isRoomAdmin).mockResolvedValue(false)

    await expect(
      service.getEffectiveSourceIdsForUser(roomId, userId, "search", room),
    ).resolves.toEqual(["spotify"])
    expect(findRoom).not.toHaveBeenCalled()
  })

  test("canAccess accepts a preloaded room", async () => {
    const room = {
      id: roomId,
      creator: "admin",
      playbackControllerId: "bridge",
      metadataSourceIds: ["spotify", "youtube"],
      metadataSourceAccess: { youtube: "restricted" },
    } as any
    vi.mocked(isRoomAdmin).mockResolvedValue(false)
    grantMock.mockResolvedValue(false)

    await expect(
      service.canAccess({ roomId, userId, sourceId: "youtube", action: "queue", room }),
    ).resolves.toBe(false)
    expect(findRoom).not.toHaveBeenCalled()
  })

  test("getLocalCatalogPlaylistIds skips the room read when the caller supplies the room", async () => {
    const room = { id: roomId, creator: "admin", playbackControllerId: "spotify" } as any

    await expect(service.getLocalCatalogPlaylistIds(roomId, userId, room)).resolves.toBeUndefined()
    expect(findRoom).not.toHaveBeenCalled()
  })

  test("getLocalCatalogShelves skips the room read when the caller supplies the room", async () => {
    const room = { id: roomId, creator: "admin", playbackControllerId: "spotify" } as any

    await expect(service.getLocalCatalogShelves(roomId, userId, room)).resolves.toBeUndefined()
    expect(findRoom).not.toHaveBeenCalled()
  })

  test("getLocalCatalogShelves returns album-only shelves without falling through", async () => {
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: "admin",
      playbackControllerId: "bridge",
      metadataSourceAccess: { local: "restricted" },
    } as any)
    vi.mocked(isRoomAdmin).mockResolvedValue(false)
    const context = {
      pluginRegistry: {
        resolveLocalLibraryCatalogFilter: vi.fn().mockResolvedValue({
          mode: "playlists",
          playlistIds: [],
          albumIds: ["al-1"],
        }),
      },
      redis: { pubClient: {}, subClient: {} },
    }
    const svc = new MetadataSourceAccessService(context as any)
    await expect(svc.getLocalCatalogShelves(roomId, userId)).resolves.toEqual({
      playlistIds: [],
      albumIds: ["al-1"],
    })
  })

  test("getEffectiveSourceIdsForUser returns nothing when the room is missing", async () => {
    vi.mocked(findRoom).mockResolvedValue(null as any)

    await expect(service.getEffectiveSourceIdsForUser(roomId, userId, "search")).resolves.toEqual(
      [],
    )
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

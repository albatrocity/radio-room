import { describe, expect, test, vi, beforeEach } from "vitest"
import { DJService } from "./DJService"
import { AppContext, QueueItem } from "@repo/types"
import { MetadataSource } from "@repo/types"

// Mock dependencies
vi.mock("../operations/data", () => ({
  addDj: vi.fn(),
  addToQueue: vi.fn(),
  findRoom: vi.fn(),
  getDjs: vi.fn(),
  getQueue: vi.fn(),
  getUser: vi.fn(),
  isDj: vi.fn(),
  removeDj: vi.fn(),
  updateUserAttributes: vi.fn(),
}))
vi.mock("../lib/systemMessage", () => ({
  default: vi.fn((msg) => ({ content: msg, type: "system" })),
}))

// Import mocked dependencies
import systemMessage from "../lib/systemMessage"
import {
  addDj,
  addToQueue,
  findRoom,
  getDjs,
  getQueue,
  getUser,
  isDj,
  removeDj,
  updateUserAttributes,
} from "../operations/data"
import {
  appContextFactory,
  metadataSourceTrackFactory,
  queueItemFactory,
  roomFactory,
  userFactory,
} from "@repo/factories"

describe("DJService", () => {
  let djService: DJService
  let mockContext: AppContext
  const mockUser = userFactory.build({
    userId: "user123",
    username: "Homer",
    isAdmin: false,
    isDj: false,
    isDeputyDj: false,
    status: "participating" as const,
    id: "socket123",
  })

  beforeEach(() => {
    vi.resetAllMocks()
    mockContext = appContextFactory.build()
    djService = new DJService(mockContext)

    // Setup default mocks
    vi.mocked(getUser).mockResolvedValue(mockUser)
    vi.mocked(getQueue).mockResolvedValue([])
    vi.mocked(updateUserAttributes).mockResolvedValue({
      user: mockUser,
      users: [mockUser],
    })
    vi.mocked(systemMessage).mockImplementation((msg) => ({
      content: msg,
      type: "system",
      timestamp: new Date().toString(),
      mentions: [],
      meta: {},
      user: {
        username: mockUser.username!,
        id: mockUser.id!,
        userId: mockUser.userId,
      },
    }))
  })

  test("should be defined", () => {
    expect(djService).toBeDefined()
  })

  describe("deputizeUser", () => {
    test("adds user as DJ when not already a DJ", async () => {
      // Mock that user is not already a DJ
      vi.mocked(isDj).mockResolvedValue(false)

      const result = await djService.deputizeUser("room123", "user123")

      expect(addDj).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        userId: "user123",
      })

      expect(updateUserAttributes).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
        attributes: { isDeputyDj: true },
        roomId: "room123",
      })

      expect(result).toEqual({
        user: mockUser,
        users: [mockUser],
        socketId: "socket123",
        eventType: "START_DEPUTY_DJ_SESSION",
        message: expect.stringContaining("promoted"),
        systemMessage: expect.objectContaining({
          content: expect.stringContaining("promoted"),
          type: "system",
        }),
      })
    })

    test("removes user as DJ when already a DJ", async () => {
      // Mock that user is already a DJ
      vi.mocked(isDj).mockResolvedValue(true)

      const result = await djService.deputizeUser("room123", "user123")

      expect(removeDj).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        userId: "user123",
      })

      expect(updateUserAttributes).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
        attributes: { isDeputyDj: false },
        roomId: "room123",
      })

      expect(result).toEqual({
        user: mockUser,
        users: [mockUser],
        socketId: "socket123",
        eventType: "END_DEPUTY_DJ_SESSION",
        message: expect.stringContaining("no longer"),
        systemMessage: expect.objectContaining({
          content: expect.stringContaining("no longer"),
          type: "system",
        }),
      })
    })
  })

  describe("queueSong", () => {
    test("adds song to queue when not already in queue", async () => {
      // Mock for addToQueue
      vi.mocked(addToQueue).mockResolvedValue(undefined)

      const result = await djService.queueSong("room123", "user123", "Homer", "track123")

      expect(addToQueue).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        item: expect.objectContaining({
          track: expect.anything(),
          addedBy: {
            userId: "user123",
            username: "Homer",
          },
          addedAt: expect.any(Number),
        }),
      })

      expect(result).toEqual({
        success: true,
        queuedItem: expect.objectContaining({
          addedBy: {
            userId: "user123",
            username: "Homer",
          },
        }),
        systemMessage: expect.objectContaining({
          content: expect.stringContaining("Homer"),
          type: "system",
        }),
      })
    })

    test("returns error when song is already in queue (same user)", async () => {
      // Mock that track is already in queue from the same user
      const queueItem = queueItemFactory.build({
        addedBy: {
          userId: "user123",
          username: "Homer",
        },
        addedAt: Date.now(),
        addedDuring: undefined,
        playedAt: undefined,
        title: "Test Track",
      })

      vi.mocked(getQueue).mockResolvedValue([queueItem])

      const result = await djService.queueSong("room123", "user123", "Homer", queueItem.track.id)

      expect(addToQueue).not.toHaveBeenCalled()

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining("You've already queued that song"),
      })
    })

    test("returns error when song is already in queue (different user)", async () => {
      // Mock that track is already in queue from a different user
      const mockUser = userFactory.build({
        username: "Marge",
        userId: "otherUser",
      })

      const metadataSourceTrack = metadataSourceTrackFactory.build({
        id: "track123",
      })

      const queueItem = queueItemFactory.build({
        addedBy: mockUser,
        track: metadataSourceTrack,
      })

      vi.mocked(getQueue).mockResolvedValue([queueItem])

      // Return user info for the queue item's user
      vi.mocked(getUser).mockResolvedValueOnce(mockUser)

      const result = await djService.queueSong("room123", "user123", "Homer", "track123")

      expect(addToQueue).not.toHaveBeenCalled()

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining("Marge has already queued that song"),
      })
    })
  })

  describe("searchForTrack", () => {
    test("returns search results when successful", async () => {
      // Mock metadata source with search API
      const mockSearchResults = { tracks: [{ id: "track123", name: "Test Track" }] }
      const mockMetadataSource = {
        api: {
          search: vi.fn().mockResolvedValue(mockSearchResults),
        },
      } as unknown as MetadataSource

      const result = await djService.searchForTrack(mockMetadataSource, "test query")

      expect(mockMetadataSource.api.search).toHaveBeenCalledWith("test query")

      expect(result).toEqual({
        success: true,
        data: mockSearchResults,
      })
    })

    test("returns error when search fails", async () => {
      // Mock metadata source with failing search API
      const mockError = new Error("Search failed")
      const mockMetadataSource = {
        api: {
          search: vi.fn().mockRejectedValue(mockError),
        },
      } as unknown as MetadataSource

      const result = await djService.searchForTrack(mockMetadataSource, "test query")

      expect(mockMetadataSource.api.search).toHaveBeenCalledWith("test query")

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining("Something went wrong"),
        error: mockError,
      })
    })
  })

  describe("savePlaylist", () => {
    test("creates playlist when API is available", async () => {
      // Mock successful playlist creation
      const mockPlaylistResult = { id: "playlist123", name: "My Playlist" }
      const mockMetadataSource = {
        api: {
          createPlaylist: vi.fn().mockResolvedValue(mockPlaylistResult),
        },
      } as unknown as MetadataSource

      const trackIds = ["track1", "track2"] as QueueItem["track"]["id"][]

      const result = await djService.savePlaylist(
        mockMetadataSource,
        "user123",
        "My Playlist",
        trackIds,
      )

      expect(mockMetadataSource.api.createPlaylist).toHaveBeenCalledWith({
        title: "My Playlist",
        trackIds,
        userId: "user123",
      })

      expect(result).toEqual({
        success: true,
        data: mockPlaylistResult,
      })
    })

    test("returns error when createPlaylist API is not available", async () => {
      // Mock metadata source without createPlaylist API
      const mockMetadataSource = {
        api: {},
      } as unknown as MetadataSource

      const trackIds = ["track1", "track2"] as QueueItem["track"]["id"][]

      const result = await djService.savePlaylist(
        mockMetadataSource,
        "user123",
        "My Playlist",
        trackIds,
      )

      expect(result).toEqual({
        success: false,
        message: expect.stringContaining("not supported"),
      })
    })

    test("returns error when playlist creation fails", async () => {
      // Mock failed playlist creation
      const mockError = new Error("Creation failed")
      const mockMetadataSource = {
        api: {
          createPlaylist: vi.fn().mockRejectedValue(mockError),
        },
      } as unknown as MetadataSource

      const trackIds = ["track1", "track2"] as QueueItem["track"]["id"][]

      const result = await djService.savePlaylist(
        mockMetadataSource,
        "user123",
        "My Playlist",
        trackIds,
      )

      expect(mockMetadataSource.api.createPlaylist).toHaveBeenCalled()

      expect(result).toEqual({
        success: false,
        error: mockError,
      })
    })
  })

  describe("handleUserJoined", () => {
    test("returns shouldDeputize:true when room has deputizeOnJoin true and user not already a DJ", async () => {
      // Mock room with deputizeOnJoin enabled
      vi.mocked(findRoom).mockResolvedValue(
        roomFactory.build({
          id: "room123",
          deputizeOnJoin: true,
        }),
      )

      // Mock that user is not in DJs list
      vi.mocked(getDjs).mockResolvedValue(["otherUser"])

      const result = await djService.handleUserJoined("room123", mockUser)

      expect(findRoom).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })
      expect(getDjs).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(result).toEqual({
        shouldDeputize: true,
        userId: "user123",
      })
    })

    test("returns shouldDeputize:false when room has deputizeOnJoin false", async () => {
      // Mock room with deputizeOnJoin disabled
      vi.mocked(findRoom).mockResolvedValue(
        roomFactory.build({
          id: "room123",
          deputizeOnJoin: false,
        }),
      )

      const result = await djService.handleUserJoined("room123", mockUser)

      expect(result).toEqual({
        shouldDeputize: false,
      })
    })

    test("returns shouldDeputize:false when user is already a DJ", async () => {
      const user = userFactory.build({
        userId: "user123",
        isDeputyDj: true,
      })
      // Mock room with deputizeOnJoin enabled
      vi.mocked(findRoom).mockResolvedValue(
        roomFactory.build({
          id: "room123",
          deputizeOnJoin: true,
        }),
      )

      // Mock that user is already in DJs list
      vi.mocked(getDjs).mockResolvedValue([user.userId])

      const result = await djService.handleUserJoined("room123", user)

      expect(result).toEqual({
        shouldDeputize: false,
      })
    })
  })
})

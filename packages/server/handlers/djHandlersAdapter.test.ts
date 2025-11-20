import { describe, expect, test, vi, beforeEach } from "vitest"
import { DJHandlers } from "./djHandlersAdapter"
import { DJService } from "../services/DJService"
import { AdapterService } from "../services/AdapterService"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { User, QueueItem, MetadataSource, AppContext } from "@repo/types"
import { queueItemFactory, appContextFactory } from "@repo/factories"

// Mock dependencies
vi.mock("../services/DJService")
vi.mock("../services/AdapterService")
vi.mock("../operations/sockets/users", () => ({
  pubUserJoined: vi.fn(),
}))
vi.mock("../lib/sendMessage", () => ({
  default: vi.fn(),
}))

// Import mocked dependencies
import sendMessage from "../lib/sendMessage"
import { pubUserJoined } from "../operations/sockets/users"

describe("DJHandlers", () => {
  let mockSocket: any
  let mockIo: any
  let djService: any
  let adapterService: any
  let djHandlers: DJHandlers
  let mockContext: AppContext
  let toEmit: any
  let broadcastEmit: any
  let toBroadcast: any
  let roomSpy: any

  // Mock return values
  const mockUser = { userId: "1", username: "Homer" } as User
  const mockUsers = [mockUser] as User[]
  const mockSystemMessage = { content: "Test system message", type: "system" }
  const mockRoomPath = "/rooms/room1"
  const mockQueueItem = queueItemFactory.build()
  const mockMetadataSource = {
    name: "spotify",
    authentication: { type: "oauth" },
    api: { search: vi.fn(), findById: vi.fn(), createPlaylist: vi.fn() },
  } as unknown as MetadataSource

  beforeEach(() => {
    vi.resetAllMocks()

    // Setup socket mocks
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room1",
      userId: "1",
      username: "Homer",
    })

    mockSocket = socketResult.socket
    mockIo = socketResult.io
    toEmit = socketResult.toEmit
    broadcastEmit = socketResult.broadcastEmit
    toBroadcast = socketResult.toBroadcast
    roomSpy = socketResult.roomSpy

    // Create mock context
    mockContext = appContextFactory.build()

    // Mock the DJService
    djService = {
      deputizeUser: vi.fn().mockResolvedValue({
        user: mockUser,
        users: mockUsers,
        socketId: "socket123",
        eventType: "START_DEPUTY_DJ_SESSION",
        message: "You are now a DJ",
        systemMessage: mockSystemMessage,
      }),
      queueSong: vi.fn().mockResolvedValue({
        success: true,
        queuedItem: mockQueueItem,
        systemMessage: mockSystemMessage,
      }),
      searchForTrack: vi.fn().mockResolvedValue({
        success: true,
        data: { tracks: [{ id: "track123", name: "Test Track" }] },
      }),
      savePlaylist: vi.fn().mockResolvedValue({
        success: true,
        data: { id: "playlist123", name: "My Playlist" },
      }),
      handleUserJoined: vi.fn().mockResolvedValue({
        shouldDeputize: false,
      }),
    }

    // Mock the AdapterService
    adapterService = {
      getRoomMetadataSource: vi.fn().mockResolvedValue(mockMetadataSource),
      getRoomPlaybackController: vi.fn().mockResolvedValue({}),
      getRoomMediaSource: vi.fn().mockResolvedValue({}),
    }

    // Mock AdapterService constructor
    vi.mocked(AdapterService).mockImplementation(() => adapterService)

    djHandlers = new DJHandlers(djService, mockContext)
  })

  test("should be defined", () => {
    expect(djHandlers).toBeDefined()
  })

  describe("djDeputizeUser", () => {
    test("calls deputizeUser with correct parameters", async () => {
      await djHandlers.djDeputizeUser({ socket: mockSocket, io: mockIo }, "1")

      expect(djService.deputizeUser).toHaveBeenCalledWith("room1", "1")
    })

    test("emits events to the user socket when socket ID is available", async () => {
      await djHandlers.djDeputizeUser({ socket: mockSocket, io: mockIo }, "1")

      expect(mockIo.to).toHaveBeenCalledWith("socket123")
      expect(toEmit).toHaveBeenCalledWith(
        "event",
        {
          type: "NEW_MESSAGE",
          data: mockSystemMessage,
        },
        { status: "info" },
      )

      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "START_DEPUTY_DJ_SESSION",
      })
    })

    test("publishes user joined event when user data is available", async () => {
      await djHandlers.djDeputizeUser({ socket: mockSocket, io: mockIo }, "1")

      expect(pubUserJoined).toHaveBeenCalledWith({
        io: mockIo,
        roomId: "room1",
        data: { user: mockUser, users: mockUsers },
        context: mockSocket.context,
      })
    })
  })

  describe("queueSong", () => {
    test("calls queueSong with correct parameters", async () => {
      await djHandlers.queueSong({ socket: mockSocket, io: mockIo }, "track123")

      expect(djService.queueSong).toHaveBeenCalledWith("room1", "1", "Homer", "track123")
    })

    test("emits SONG_QUEUED event on success", async () => {
      await djHandlers.queueSong({ socket: mockSocket, io: mockIo }, "track123")

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "SONG_QUEUED",
        data: mockQueueItem,
      })

      expect(sendMessage).toHaveBeenCalledWith(mockIo, "room1", mockSystemMessage)
    })

    test("emits SONG_QUEUE_FAILURE event on failure", async () => {
      // Override mock to simulate failure
      djService.queueSong.mockResolvedValueOnce({
        success: false,
        message: "Song already queued",
      })

      await djHandlers.queueSong({ socket: mockSocket, io: mockIo }, "track123")

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "SONG_QUEUE_FAILURE",
        data: {
          message: "Song already queued",
        },
      })

      expect(sendMessage).not.toHaveBeenCalled()
    })

    test("handles errors thrown during queue operation", async () => {
      // Override mock to throw error
      djService.queueSong.mockRejectedValueOnce(new Error("Test error"))

      await djHandlers.queueSong({ socket: mockSocket, io: mockIo }, "track123")

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "SONG_QUEUE_FAILURE",
        data: {
          message: "Song could not be queued",
          error: expect.any(Error),
        },
      })
    })
  })

  describe("searchForTrack", () => {
    test("gets room metadata source and calls searchForTrack with correct parameters", async () => {
      const query = "test query"

      await djHandlers.searchForTrack({ socket: mockSocket, io: mockIo }, { query })

      expect(adapterService.getRoomMetadataSource).toHaveBeenCalledWith("room1")
      expect(djService.searchForTrack).toHaveBeenCalledWith(mockMetadataSource, query)
    })

    test("emits TRACK_SEARCH_RESULTS event on success", async () => {
      const mockResults = { tracks: [{ id: "track123", name: "Test Track" }] }

      // Override mock to return specific data
      djService.searchForTrack.mockResolvedValueOnce({
        success: true,
        data: mockResults,
      })

      await djHandlers.searchForTrack(
        { socket: mockSocket, io: mockIo },
        {
          query: "test",
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "TRACK_SEARCH_RESULTS",
        data: mockResults,
      })
    })

    test("emits TRACK_SEARCH_RESULTS_FAILURE event when metadata source is not configured", async () => {
      // Override mock to return null (no metadata source configured)
      adapterService.getRoomMetadataSource.mockResolvedValueOnce(null)

      await djHandlers.searchForTrack(
        { socket: mockSocket, io: mockIo },
        {
          query: "test",
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "TRACK_SEARCH_RESULTS_FAILURE",
        data: {
          message: "No metadata source configured for this room",
        },
      })

      expect(djService.searchForTrack).not.toHaveBeenCalled()
    })

    test("emits TRACK_SEARCH_RESULTS_FAILURE event on failure", async () => {
      const mockError = new Error("Search failed")

      // Override mock to simulate failure
      djService.searchForTrack.mockResolvedValueOnce({
        success: false,
        message: "Search failed",
        error: mockError,
      })

      await djHandlers.searchForTrack(
        { socket: mockSocket, io: mockIo },
        {
          query: "test",
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "TRACK_SEARCH_RESULTS_FAILURE",
        data: {
          message: "Search failed",
          error: mockError,
        },
      })
    })
  })

  describe("savePlaylist", () => {
    test("gets room metadata source and calls savePlaylist with correct parameters", async () => {
      const name = "My Playlist"
      const trackIds = ["track1", "track2"] as QueueItem["track"]["id"][]

      await djHandlers.savePlaylist(
        { socket: mockSocket, io: mockIo },
        {
          name,
          trackIds,
        },
      )

      expect(adapterService.getRoomMetadataSource).toHaveBeenCalledWith("room1")
      expect(djService.savePlaylist).toHaveBeenCalledWith(mockMetadataSource, "1", name, trackIds)
    })

    test("emits PLAYLIST_SAVED event on success", async () => {
      const mockPlaylist = { id: "playlist123", name: "My Playlist" }

      // Override mock to return specific data
      djService.savePlaylist.mockResolvedValueOnce({
        success: true,
        data: mockPlaylist,
      })

      await djHandlers.savePlaylist(
        { socket: mockSocket, io: mockIo },
        {
          name: "My Playlist",
          trackIds: ["track1"],
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "PLAYLIST_SAVED",
        data: mockPlaylist,
      })
    })

    test("emits SAVE_PLAYLIST_FAILED event when metadata source is not configured", async () => {
      // Override mock to return null (no metadata source configured)
      adapterService.getRoomMetadataSource.mockResolvedValueOnce(null)

      await djHandlers.savePlaylist(
        { socket: mockSocket, io: mockIo },
        {
          name: "My Playlist",
          trackIds: ["track1"],
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "SAVE_PLAYLIST_FAILED",
        error: expect.any(Error),
      })

      expect(djService.savePlaylist).not.toHaveBeenCalled()
    })

    test("emits SAVE_PLAYLIST_FAILED event on failure", async () => {
      const mockError = new Error("Save failed")

      // Override mock to simulate failure
      djService.savePlaylist.mockResolvedValueOnce({
        success: false,
        error: mockError,
      })

      await djHandlers.savePlaylist(
        { socket: mockSocket, io: mockIo },
        {
          name: "My Playlist",
          trackIds: ["track1"],
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "SAVE_PLAYLIST_FAILED",
        error: mockError,
      })
    })
  })

  describe("handleUserJoined", () => {
    test("calls handleUserJoined with correct parameters", async () => {
      await djHandlers.handleUserJoined(
        { socket: mockSocket, io: mockIo },
        { user: mockUser, users: mockUsers },
      )

      expect(djService.handleUserJoined).toHaveBeenCalledWith("room1", mockUser)
    })

    test("calls djDeputizeUser when shouldDeputize is true", async () => {
      // Override mock to return shouldDeputize: true
      djService.handleUserJoined.mockResolvedValueOnce({
        shouldDeputize: true,
        userId: "1",
      })

      // Spy on the djDeputizeUser method
      const spy = vi.spyOn(djHandlers, "djDeputizeUser")

      await djHandlers.handleUserJoined(
        { socket: mockSocket, io: mockIo },
        { user: mockUser, users: mockUsers },
      )

      expect(spy).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, "1")
    })

    test("does not call djDeputizeUser when shouldDeputize is false", async () => {
      // Spy on the djDeputizeUser method
      const spy = vi.spyOn(djHandlers, "djDeputizeUser")

      await djHandlers.handleUserJoined(
        { socket: mockSocket, io: mockIo },
        { user: mockUser, users: mockUsers },
      )

      expect(spy).not.toHaveBeenCalled()
    })
  })
})

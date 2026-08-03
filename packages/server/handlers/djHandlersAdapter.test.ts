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
vi.mock("../operations/data", async () => {
  const actual = await vi.importActual("../operations/data")
  return {
    ...actual,
    findRoom: vi.fn().mockResolvedValue({
      id: "room1",
      userId: "1",
      creator: "1", // Room creator ID
      title: "Test Room",
      metadataSourceIds: ["spotify"],
    }),
  }
})

// Import mocked dependencies
import sendMessage from "../lib/sendMessage"
import { pubUserJoined } from "../operations/sockets/users"
import * as dataOps from "../operations/data"

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

    // Spy on findRoom to return mock room data
    vi.spyOn(dataOps, "findRoom").mockResolvedValue({
      id: "room1",
      userId: "1",
      creator: "1",
      title: "Test Room",
      metadataSourceIds: ["spotify"],
    } as any)

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
        data: [{ id: "track123", title: "Test Track", artist: "A", urls: [] }],
      }),
      savePlaylist: vi.fn().mockResolvedValue({
        success: true,
        data: { id: "playlist123", name: "My Playlist" },
      }),
      handleUserJoined: vi.fn().mockResolvedValue({
        shouldDeputize: false,
      }),
      reorderQueue: vi.fn().mockResolvedValue({
        success: true,
      }),
      setQueueSplit: vi.fn().mockResolvedValue({
        success: true,
      }),
      removeQueueSplit: vi.fn().mockResolvedValue({
        success: true,
      }),
    }

    // Mock the AdapterService
    adapterService = {
      getRoomMetadataSource: vi.fn().mockResolvedValue(mockMetadataSource),
      getRoomMetadataSources: vi
        .fn()
        .mockResolvedValue(new Map([["spotify", mockMetadataSource]])),
      getUserMetadataSource: vi.fn().mockResolvedValue(mockMetadataSource),
      getRoomPlaybackController: vi.fn().mockResolvedValue({}),
      getRoomMediaSource: vi.fn().mockResolvedValue({}),
    }

    // Mock AdapterService constructor - use function() to create a proper constructor
    vi.mocked(AdapterService).mockImplementation(function () {
      return adapterService
    } as any)

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
          type: "MESSAGE_RECEIVED",
          data: {
            roomId: "room1",
            message: mockSystemMessage,
          },
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

      expect(djService.queueSong).toHaveBeenCalledWith(
        "room1",
        "1",
        "Homer",
        "track123",
        undefined,
      )
    })

    test("emits SONG_QUEUED event on success", async () => {
      await djHandlers.queueSong({ socket: mockSocket, io: mockIo }, "track123")

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "SONG_QUEUED",
        data: mockQueueItem,
      })

      expect(sendMessage).toHaveBeenCalledWith(
        mockIo,
        "room1",
        mockSystemMessage,
        expect.any(Object),
      )
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
    test("calls searchForTrack with correct parameters", async () => {
      const query = "test query"

      await djHandlers.searchForTrack({ socket: mockSocket, io: mockIo }, { query })

      // Handler now calls DJService directly, which internally gets the metadata source
      expect(djService.searchForTrack).toHaveBeenCalled()
    })

    test("emits TRACK_SEARCH_RESULTS event on success", async () => {
      const mockTracks = [{ id: "track123", title: "Test Track", artist: "A", urls: [] }]

      djService.searchForTrack.mockResolvedValueOnce({
        success: true,
        data: mockTracks,
      })

      await djHandlers.searchForTrack(
        { socket: mockSocket, io: mockIo },
        {
          query: "test",
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "TRACK_SEARCH_RESULTS",
        data: {
          items: [{ ...mockTracks[0], source: "spotify" }],
          total: 1,
          offset: 0,
          limit: 20,
          artists: [],
          albums: [],
        },
      })
    })

    test("emits TRACK_SEARCH_RESULTS_FAILURE event when metadata source is not configured", async () => {
      adapterService.getRoomMetadataSources.mockResolvedValueOnce(new Map())

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
    })

    test("emits TRACK_SEARCH_RESULTS with empty items when source search fails", async () => {
      djService.searchForTrack.mockResolvedValueOnce({
        success: false,
        message: "Search failed",
      })

      await djHandlers.searchForTrack(
        { socket: mockSocket, io: mockIo },
        {
          query: "test",
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "TRACK_SEARCH_RESULTS",
        data: {
          items: [],
          total: 0,
          offset: 0,
          limit: 20,
          artists: [],
          albums: [],
        },
      })
    })
  })

  describe("savePlaylist", () => {
    test("calls savePlaylist with correct parameters", async () => {
      const name = "My Playlist"
      const trackIds = ["track1", "track2"] as QueueItem["track"]["id"][]

      await djHandlers.savePlaylist(
        { socket: mockSocket, io: mockIo },
        {
          name,
          trackIds,
        },
      )

      // Handler now calls DJService directly, which internally gets the metadata source
      expect(djService.savePlaylist).toHaveBeenCalled()
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
      // Mock DJService to return failure
      djService.savePlaylist.mockResolvedValueOnce({
        success: false,
        message: "No metadata source configured",
        error: { message: "No metadata source configured" },
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
        error: expect.objectContaining({
          message: "No metadata source configured",
        }),
      })
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
        error: expect.objectContaining({
          message: "Save failed",
        }),
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

  describe("reorderQueue", () => {
    test("calls djService.reorderQueue with ordered keys", async () => {
      const keys = ["spotify:track-a", "spotify:track-b"]
      await djHandlers.reorderQueue({ socket: mockSocket, io: mockIo }, { orderedKeys: keys })

      expect(djService.reorderQueue).toHaveBeenCalledWith("room1", "1", keys)
    })

    test("emits REORDER_QUEUE_SUCCESS when service succeeds", async () => {
      djService.reorderQueue.mockResolvedValueOnce({ success: true })

      await djHandlers.reorderQueue({ socket: mockSocket, io: mockIo }, {
        orderedKeys: ["spotify:a"],
      })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", { type: "REORDER_QUEUE_SUCCESS" })
    })

    test("emits REORDER_QUEUE_FAILURE when payload is not an array", async () => {
      await djHandlers.reorderQueue({ socket: mockSocket, io: mockIo }, {
        orderedKeys: null as unknown as string[],
      })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "REORDER_QUEUE_FAILURE",
        data: { message: "Invalid payload" },
      })
      expect(djService.reorderQueue).not.toHaveBeenCalled()
    })

    test("emits REORDER_QUEUE_FAILURE when service rejects", async () => {
      djService.reorderQueue.mockResolvedValueOnce({
        success: false,
        message: "Not authorized",
      })

      await djHandlers.reorderQueue({ socket: mockSocket, io: mockIo }, {
        orderedKeys: ["spotify:a"],
      })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "REORDER_QUEUE_FAILURE",
        data: { message: "Not authorized" },
      })
    })
  })

  describe("setQueueSplit", () => {
    test("calls djService.setQueueSplit with belowKey", async () => {
      await djHandlers.setQueueSplit(
        { socket: mockSocket, io: mockIo },
        { belowKey: "spotify:track-b" },
      )

      expect(djService.setQueueSplit).toHaveBeenCalledWith("room1", "1", "spotify:track-b")
    })

    test("emits SET_QUEUE_SPLIT_SUCCESS when service succeeds", async () => {
      djService.setQueueSplit.mockResolvedValueOnce({ success: true })

      await djHandlers.setQueueSplit(
        { socket: mockSocket, io: mockIo },
        { belowKey: "spotify:track-b" },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", { type: "SET_QUEUE_SPLIT_SUCCESS" })
    })

    test("emits SET_QUEUE_SPLIT_FAILURE when payload is invalid", async () => {
      await djHandlers.setQueueSplit({ socket: mockSocket, io: mockIo }, { belowKey: "" })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "SET_QUEUE_SPLIT_FAILURE",
        data: { message: "Invalid payload" },
      })
      expect(djService.setQueueSplit).not.toHaveBeenCalled()
    })
  })

  describe("removeQueueSplit", () => {
    test("calls djService.removeQueueSplit", async () => {
      await djHandlers.removeQueueSplit({ socket: mockSocket, io: mockIo })

      expect(djService.removeQueueSplit).toHaveBeenCalledWith("room1", "1")
    })

    test("emits REMOVE_QUEUE_SPLIT_SUCCESS when service succeeds", async () => {
      djService.removeQueueSplit.mockResolvedValueOnce({ success: true })

      await djHandlers.removeQueueSplit({ socket: mockSocket, io: mockIo })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "REMOVE_QUEUE_SPLIT_SUCCESS",
      })
    })
  })

  describe("catalog browse", () => {
    let listArtists: ReturnType<typeof vi.fn>
    let listAlbums: ReturnType<typeof vi.fn>
    let getArtist: ReturnType<typeof vi.fn>
    let getAlbum: ReturnType<typeof vi.fn>
    let browseableLocal: MetadataSource

    beforeEach(() => {
      listArtists = vi.fn().mockResolvedValue({
        items: [{ id: "a1", title: "Artist One" }],
        total: 1,
      })
      listAlbums = vi.fn().mockResolvedValue({
        items: [{ id: "al1", title: "Album One", artists: [] }],
        total: 1,
      })
      getArtist = vi.fn().mockResolvedValue({
        artist: { id: "a1", title: "Artist One" },
        albums: [{ id: "al1", title: "Album", artists: [] }],
      })
      getAlbum = vi.fn().mockResolvedValue({
        album: { id: "al1", title: "Album", artists: [] },
        tracks: [{ id: "t1", title: "Track", urls: [], artists: [], album: {}, duration: 0 }],
      })
      browseableLocal = {
        name: "local",
        authentication: { type: "none" },
        api: {
          search: async () => [],
          searchByParams: async () => [],
          findById: async () => null,
          listArtists,
          listAlbums,
          getArtist,
          getAlbum,
          getBrowseCapabilities: () => ({ entryMode: "index", albumSearch: true }),
        },
      } as unknown as MetadataSource

      adapterService.getRoomMetadataSources.mockResolvedValue(
        new Map([
          ["spotify", mockMetadataSource],
          ["local", browseableLocal],
        ]),
      )
    })

    test("getEffectiveMetadataSources includes browseableSourceIds", async () => {
      await djHandlers.getEffectiveMetadataSources({ socket: mockSocket, io: mockIo })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "EFFECTIVE_METADATA_SOURCES",
        data: {
          metadataSourceIds: ["spotify"],
          browseableSourceIds: [],
          browseSourceCapabilities: {},
        },
      })
    })

    test("getEffectiveMetadataSources marks local as browseable when effective", async () => {
      vi.spyOn(dataOps, "findRoom").mockResolvedValueOnce({
        id: "room1",
        metadataSourceIds: ["spotify", "local"],
      } as any)

      await djHandlers.getEffectiveMetadataSources({ socket: mockSocket, io: mockIo })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "EFFECTIVE_METADATA_SOURCES",
        data: {
          metadataSourceIds: ["spotify", "local"],
          browseableSourceIds: ["local"],
          browseSourceCapabilities: {
            local: { entryMode: "index", albumSearch: true },
          },
        },
      })
    })

    test("browseArtists returns items for browseable source", async () => {
      await djHandlers.browseArtists(
        { socket: mockSocket, io: mockIo },
        { source: "local", query: "art" },
      )

      expect(listArtists).toHaveBeenCalledWith({
        query: "art",
        offset: undefined,
        limit: undefined,
      })
      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "BROWSE_ARTISTS_RESULTS",
        data: {
          source: "local",
          items: [{ id: "a1", title: "Artist One" }],
          total: 1,
        },
      })
    })

    test("browseArtists fails when source does not support browse", async () => {
      await djHandlers.browseArtists({ socket: mockSocket, io: mockIo }, { source: "spotify" })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "BROWSE_ARTISTS_FAILURE",
        data: { message: "Metadata source does not support browse" },
      })
    })

    test("browseAlbums returns items for browseable source", async () => {
      await djHandlers.browseAlbums(
        { socket: mockSocket, io: mockIo },
        { source: "local", query: "alb" },
      )

      expect(listAlbums).toHaveBeenCalledWith({
        query: "alb",
        offset: undefined,
        limit: undefined,
      })
      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "BROWSE_ALBUMS_RESULTS",
        data: {
          source: "local",
          items: [{ id: "al1", title: "Album One", artists: [] }],
          total: 1,
        },
      })
    })

    test("browseAlbum tags tracks with source", async () => {
      await djHandlers.browseAlbum(
        { socket: mockSocket, io: mockIo },
        { source: "local", albumId: "al1" },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "BROWSE_ALBUM_RESULTS",
        data: {
          source: "local",
          album: { id: "al1", title: "Album", artists: [] },
          tracks: [
            expect.objectContaining({
              id: "t1",
              source: "local",
            }),
          ],
        },
      })
    })

    test("browseArtist denies when access service rejects", async () => {
      mockContext.metadataSourceAccess = {
        canAccess: vi.fn().mockResolvedValue(false),
        getEffectiveSourceIdsForUser: vi.fn(),
      } as any

      await djHandlers.browseArtist(
        { socket: mockSocket, io: mockIo },
        { source: "local", artistId: "a1" },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "BROWSE_ARTIST_FAILURE",
        data: { message: "You do not have access to this metadata source" },
      })
      expect(getArtist).not.toHaveBeenCalled()
    })
  })
})

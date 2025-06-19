import { describe, expect, test, vi, beforeEach } from "vitest"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { User, QueueItem, MetadataSource } from "@repo/types"

// Define mocks at the top level
const mockDjDeputizeUser = vi.fn()
const mockQueueSong = vi.fn()
const mockSearchForTrack = vi.fn()
const mockSavePlaylist = vi.fn()
const mockHandleUserJoined = vi.fn()

// Mock the adapter's createDJHandlers function
vi.mock("./djHandlersAdapter", () => ({
  createDJHandlers: () => ({
    djDeputizeUser: mockDjDeputizeUser,
    queueSong: mockQueueSong,
    searchForTrack: mockSearchForTrack,
    savePlaylist: mockSavePlaylist,
    handleUserJoined: mockHandleUserJoined,
  }),
}))

// Import after mocking
import {
  djDeputizeUser,
  queueSong,
  searchForTrack,
  savePlaylist,
  handleUserJoined,
} from "./djHandlers"

describe("djHandlers", () => {
  let mockSocket: any, mockIo: any, mockContext: any

  beforeEach(() => {
    vi.resetAllMocks()

    // Setup socket mocks with context
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room1",
      userId: "user123",
      username: "Homer",
    })

    mockSocket = socketResult.socket
    mockIo = socketResult.io
    mockContext = { redis: {}, db: {} }

    // Add context to the socket
    mockSocket.context = mockContext
  })

  test("djDeputizeUser delegates to adapter", async () => {
    const userId = "user123"

    await djDeputizeUser({ socket: mockSocket, io: mockIo }, userId)

    expect(mockDjDeputizeUser).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, userId)
  })

  test("queueSong delegates to adapter", async () => {
    const trackId = "track123"

    await queueSong({ socket: mockSocket, io: mockIo }, trackId)

    expect(mockQueueSong).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, trackId)
  })

  test("searchForTrack delegates to adapter", async () => {
    const metadataSource = { api: { search: vi.fn() } } as unknown as MetadataSource
    const query = "search term"

    await searchForTrack({ socket: mockSocket, io: mockIo }, metadataSource, { query })

    expect(mockSearchForTrack).toHaveBeenCalledWith(
      { socket: mockSocket, io: mockIo },
      metadataSource,
      { query },
    )
  })

  test("savePlaylist delegates to adapter", async () => {
    const metadataSource = { api: { createPlaylist: vi.fn() } } as unknown as MetadataSource
    const name = "My Playlist"
    const trackIds = ["track1", "track2"] as QueueItem["track"]["id"][]

    await savePlaylist({ socket: mockSocket, io: mockIo }, metadataSource, { name, trackIds })

    expect(mockSavePlaylist).toHaveBeenCalledWith(
      { socket: mockSocket, io: mockIo },
      metadataSource,
      { name, trackIds },
    )
  })

  test("handleUserJoined delegates to adapter", async () => {
    const user = { userId: "user123", username: "Homer" } as User
    const users = [user] as User[]

    await handleUserJoined({ socket: mockSocket, io: mockIo }, { user, users })

    expect(mockHandleUserJoined).toHaveBeenCalledWith(
      { socket: mockSocket, io: mockIo },
      { user, users },
    )
  })
})

import { describe, expect, test, vi, beforeEach } from "vitest"
import { reactionPayloadFactory } from "@repo/factories"
import { ActivityService } from "./ActivityService"
import { AppContext, ReactionSubject, Emoji } from "@repo/types"

// Mock dependencies
vi.mock("../operations/data", () => ({
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  updateUserAttributes: vi.fn(),
}))

vi.mock("../operations/room/listeningTransportStats", () => ({
  onListeningStarted: vi.fn(),
  onListeningStopped: vi.fn(),
  onListeningTransportChanged: vi.fn(),
}))

// Import mocked dependencies
import { addReaction, removeReaction, updateUserAttributes } from "../operations/data"
import { appContextFactory, userFactory } from "@repo/factories"

describe("ActivityService", () => {
  let activityService: ActivityService
  let mockContext: AppContext
  const mockUser = userFactory.build({
    userId: "user123",
    username: "Homer",
    status: "participating" as const,
  })

  beforeEach(() => {
    vi.resetAllMocks()
    mockContext = appContextFactory.build()
    activityService = new ActivityService(mockContext)

    vi.mocked(updateUserAttributes).mockResolvedValue({
      user: mockUser,
      users: [],
    })
  })

  test("should be defined", () => {
    expect(activityService).toBeDefined()
  })

  describe("startListening", () => {
    test("updates user status to listening without hydrating full users list", async () => {
      const result = await activityService.startListening("room123", "user123")

      expect(updateUserAttributes).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
        attributes: {
          status: "listening",
        },
        roomId: "room123",
        includeRoomUsers: false,
      })

      expect(result).toEqual({
        user: mockUser,
        users: [],
      })
    })
  })

  describe("stopListening", () => {
    test("updates user status to participating without hydrating full users list", async () => {
      const result = await activityService.stopListening("room123", "user123")

      expect(updateUserAttributes).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
        attributes: {
          status: "participating",
        },
        roomId: "room123",
        includeRoomUsers: false,
      })

      expect(result).toEqual({
        user: mockUser,
        users: [],
      })
    })
  })

  describe("addReaction", () => {
    test("returns null for invalid reaction type", async () => {
      const reaction = reactionPayloadFactory.build({
        reactTo: {
          type: "invalid" as any,
          id: "123",
        },
      })

      const result = await activityService.addReaction("room123", reaction)
      expect(result).toBeNull()
      expect(addReaction).not.toHaveBeenCalled()
    })

    test("adds reaction without reloading full reaction store", async () => {
      const reaction = reactionPayloadFactory.build({
        reactTo: {
          type: "message",
          id: "123",
        },
        user: mockUser,
      })

      const result = await activityService.addReaction("room123", reaction)

      expect(addReaction).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        reaction,
        reactTo: reaction.reactTo,
      })

      expect(result).toEqual({ ok: true })
    })
  })

  describe("removeReaction", () => {
    test("returns null for invalid reaction type", async () => {
      const reactTo: ReactionSubject = {
        type: "invalid" as any,
        id: "123",
      }

      const result = await activityService.removeReaction(
        "room123",
        "👍" as unknown as Emoji,
        reactTo,
        mockUser,
      )
      expect(result).toBeNull()
      expect(removeReaction).not.toHaveBeenCalled()
    })

    test("removes reaction without reloading full reaction store", async () => {
      const reactTo: ReactionSubject = {
        type: "message",
        id: "123",
      }

      const result = await activityService.removeReaction(
        "room123",
        "👍" as unknown as Emoji,
        reactTo,
        mockUser,
      )

      expect(removeReaction).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        reaction: {
          emoji: "👍",
          reactTo,
          user: mockUser,
        },
        reactTo,
      })

      expect(result).toEqual({ ok: true })
    })
  })
})

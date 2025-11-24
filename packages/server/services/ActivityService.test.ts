import { describe, expect, test, vi, beforeEach } from "vitest"
import { reactionPayloadFactory, reactionStoreFactory } from "@repo/factories"
import { ActivityService } from "./ActivityService"
import { AppContext, ReactionSubject, Emoji } from "@repo/types"

// Mock dependencies
vi.mock("../operations/data", () => ({
  addReaction: vi.fn(),
  getAllRoomReactions: vi.fn(),
  removeReaction: vi.fn(),
  updateUserAttributes: vi.fn(),
}))

// Import mocked dependencies
import {
  addReaction,
  getAllRoomReactions,
  removeReaction,
  updateUserAttributes,
} from "../operations/data"
import { appContextFactory, userFactory } from "@repo/factories"

describe("ActivityService", () => {
  let activityService: ActivityService
  let mockContext: AppContext
  const mockUser = userFactory.build({
    userId: "user123",
    username: "Homer",
    status: "participating" as const,
  })
  const mockUsers = [mockUser]

  beforeEach(() => {
    vi.resetAllMocks()
    mockContext = appContextFactory.build()
    activityService = new ActivityService(mockContext)

    // Setup default mocks
    vi.mocked(updateUserAttributes).mockResolvedValue({
      user: mockUser,
      users: mockUsers,
    })
    vi.mocked(getAllRoomReactions).mockResolvedValue({
      message: {},
      track: {},
    })
  })

  test("should be defined", () => {
    expect(activityService).toBeDefined()
  })

  describe("startListening", () => {
    test("updates user status to listening", async () => {
      const result = await activityService.startListening("room123", "user123")

      expect(updateUserAttributes).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
        attributes: {
          status: "listening",
        },
        roomId: "room123",
      })

      expect(result).toEqual({
        user: mockUser,
        users: mockUsers,
      })
    })
  })

  describe("stopListening", () => {
    test("updates user status to participating", async () => {
      const result = await activityService.stopListening("room123", "user123")

      expect(updateUserAttributes).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
        attributes: {
          status: "participating",
        },
        roomId: "room123",
      })

      expect(result).toEqual({
        user: mockUser,
        users: mockUsers,
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

    test("adds reaction and returns updated reactions", async () => {
      const mockReactions = reactionStoreFactory.build({
        message: { "123": [{ emoji: "👍", user: mockUser.userId }] },
        track: {},
      })
      vi.mocked(getAllRoomReactions).mockResolvedValueOnce(mockReactions)

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

      expect(getAllRoomReactions).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(result).toEqual({
        reactions: mockReactions,
      })
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

    test("removes reaction and returns updated reactions", async () => {
      const mockReactions = {
        message: {},
        track: {},
      }
      vi.mocked(getAllRoomReactions).mockResolvedValueOnce(mockReactions)

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

      expect(getAllRoomReactions).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(result).toEqual({
        reactions: mockReactions,
      })
    })
  })
})

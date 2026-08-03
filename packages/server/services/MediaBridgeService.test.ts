import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import { MediaBridgeService } from "./MediaBridgeService"

vi.mock("../operations/data", () => ({
  findRoom: vi.fn(),
  isRoomAdmin: vi.fn(),
}))

vi.mock("../operations/bridge/publishMediaBridgeStatus", () => ({
  publishMediaBridgeStatus: vi.fn().mockResolvedValue(undefined),
  readMediaBridgeConnected: vi.fn(),
}))

vi.mock("@repo/adapter-bridge", () => ({
  requestBridgeLink: vi.fn(),
  getOrCreateCapabilityCache: vi.fn(),
}))

import { findRoom, isRoomAdmin } from "../operations/data"
import {
  publishMediaBridgeStatus,
  readMediaBridgeConnected,
} from "../operations/bridge/publishMediaBridgeStatus"
import { requestBridgeLink, getOrCreateCapabilityCache } from "@repo/adapter-bridge"

describe("MediaBridgeService", () => {
  const roomId = "room1"
  const userId = "admin1"
  const context = {
    redis: { pubClient: {} },
    systemEvents: { emit: vi.fn() },
  } as unknown as AppContext

  let service: MediaBridgeService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new MediaBridgeService(context)
    vi.mocked(findRoom).mockResolvedValue({
      id: roomId,
      creator: userId,
      playbackControllerId: "bridge",
    } as any)
    vi.mocked(isRoomAdmin).mockResolvedValue(true)
  })

  describe("linkMediaBridge", () => {
    test("rejects non-admins", async () => {
      vi.mocked(isRoomAdmin).mockResolvedValueOnce(false)
      await expect(service.linkMediaBridge(roomId, userId)).resolves.toEqual({
        success: false,
        message: "Not authorized to link Media Bridge",
      })
      expect(requestBridgeLink).not.toHaveBeenCalled()
    })

    test("rejects non-bridge rooms", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce({
        id: roomId,
        creator: userId,
        playbackControllerId: "spotify",
      } as any)
      await expect(service.linkMediaBridge(roomId, userId)).resolves.toEqual({
        success: false,
        message: "This room is not configured to use the Media Bridge",
      })
    })

    test("links and publishes connected status", async () => {
      vi.mocked(requestBridgeLink).mockResolvedValueOnce({
        ok: true,
        daemonId: "daemon-1",
        roomId,
      } as any)
      vi.mocked(getOrCreateCapabilityCache).mockReturnValue({
        start: vi.fn().mockResolvedValue(undefined),
        getAvailableServices: () => new Set(["youtube", "local"]),
        hasReceivedCapabilities: () => true,
      } as any)

      await expect(service.linkMediaBridge(roomId, userId)).resolves.toEqual({
        success: true,
        daemonId: "daemon-1",
        roomId,
      })
      expect(publishMediaBridgeStatus).toHaveBeenCalledWith({
        context,
        roomId,
        connected: true,
        services: ["youtube", "local"],
      })
    })
  })

  describe("getMediaBridgeStatus", () => {
    test("returns disconnected for non-bridge rooms", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce({
        id: roomId,
        creator: userId,
        playbackControllerId: "spotify",
      } as any)

      await expect(service.getMediaBridgeStatus(roomId, userId)).resolves.toEqual({
        success: true,
        connected: false,
        services: undefined,
        roomId,
      })
      expect(readMediaBridgeConnected).not.toHaveBeenCalled()
    })

    test("reads presence and capabilities for bridge rooms", async () => {
      vi.mocked(readMediaBridgeConnected).mockResolvedValueOnce(true)
      vi.mocked(getOrCreateCapabilityCache).mockReturnValue({
        start: vi.fn().mockResolvedValue(undefined),
        getAvailableServices: () => new Set(["tidal"]),
        hasReceivedCapabilities: () => true,
      } as any)

      await expect(service.getMediaBridgeStatus(roomId, userId)).resolves.toEqual({
        success: true,
        connected: true,
        services: ["tidal"],
        roomId,
      })
    })
  })
})

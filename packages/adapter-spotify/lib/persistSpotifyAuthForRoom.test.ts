import { beforeEach, describe, expect, it, vi } from "vitest"

const findRoom = vi.fn()
const storeUserServiceAuth = vi.fn()
const removeUserRoomsSpotifyError = vi.fn()
const emitRoomSettingsUpdated = vi.fn()

vi.mock("@repo/server/operations/data/serviceAuthentications", () => ({
  storeUserServiceAuth: (...args: unknown[]) => storeUserServiceAuth(...args),
}))

vi.mock("@repo/server/operations/data/rooms", () => ({
  findRoom: (...args: unknown[]) => findRoom(...args),
  removeUserRoomsSpotifyError: (...args: unknown[]) => removeUserRoomsSpotifyError(...args),
  emitRoomSettingsUpdated: (...args: unknown[]) => emitRoomSettingsUpdated(...args),
}))

import { persistSpotifyAuthForRoom } from "./persistSpotifyAuthForRoom"

const tokens = {
  accessToken: "atok",
  refreshToken: "rtok",
  expiresAt: Date.now() + 3600_000,
}

describe("persistSpotifyAuthForRoom", () => {
  const hDel = vi.fn()
  const context = {
    redis: { pubClient: { hDel } },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    storeUserServiceAuth.mockResolvedValue(undefined)
    removeUserRoomsSpotifyError.mockResolvedValue(undefined)
    emitRoomSettingsUpdated.mockResolvedValue(undefined)
  })

  it("stores tokens for the linking user and clears their rooms' errors", async () => {
    await persistSpotifyAuthForRoom({
      context,
      linkingUserId: "admin-1",
      tokens,
    })

    expect(storeUserServiceAuth).toHaveBeenCalledTimes(1)
    expect(storeUserServiceAuth).toHaveBeenCalledWith({
      context,
      userId: "admin-1",
      serviceName: "spotify",
      tokens,
    })
    expect(removeUserRoomsSpotifyError).toHaveBeenCalledWith({
      context,
      userId: "admin-1",
    })
    expect(findRoom).not.toHaveBeenCalled()
  })

  it("also stores tokens under room.creator when a designated admin links", async () => {
    findRoom.mockResolvedValue({ creator: "creator-1" })

    await persistSpotifyAuthForRoom({
      context,
      linkingUserId: "admin-1",
      roomId: "room-1",
      tokens,
    })

    expect(storeUserServiceAuth).toHaveBeenCalledTimes(2)
    expect(storeUserServiceAuth).toHaveBeenNthCalledWith(2, {
      context,
      userId: "creator-1",
      serviceName: "spotify",
      tokens,
    })
    expect(hDel).toHaveBeenCalledWith("room:room-1:details", "spotifyError")
    expect(emitRoomSettingsUpdated).toHaveBeenCalledWith({ context, roomId: "room-1" })
    expect(removeUserRoomsSpotifyError).toHaveBeenCalledWith({
      context,
      userId: "creator-1",
    })
  })

  it("does not double-store when the linking user is the creator", async () => {
    findRoom.mockResolvedValue({ creator: "admin-1" })

    await persistSpotifyAuthForRoom({
      context,
      linkingUserId: "admin-1",
      roomId: "room-1",
      tokens,
    })

    expect(storeUserServiceAuth).toHaveBeenCalledTimes(1)
    expect(hDel).toHaveBeenCalledWith("room:room-1:details", "spotifyError")
  })
})

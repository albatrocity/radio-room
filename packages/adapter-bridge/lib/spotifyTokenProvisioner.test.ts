import { beforeEach, describe, expect, it, vi } from "vitest"

const findRoom = vi.fn()
const refreshAuth = vi.fn()
const getUserServiceAuth = vi.fn()
const set = vi.fn()

vi.mock("@repo/server/operations/data", () => ({
  findRoom: (...args: unknown[]) => findRoom(...args),
}))

vi.mock("@repo/adapter-spotify", () => ({
  createSpotifyServiceAuthAdapter: () => ({
    refreshAuth: (...args: unknown[]) => refreshAuth(...args),
  }),
}))

import { provisionSpotifyTokenForRoom, wireSpotifyTokenProvisioning } from "./spotifyTokenProvisioner"
import { spotifyTokenKey, BRIDGE_SPOTIFY_TOKEN_TTL_SEC } from "./protocol"

describe("provisionSpotifyTokenForRoom", () => {
  const context = {
    redis: { pubClient: { set } },
    data: { getUserServiceAuth },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("refreshes and SETs the token key with EX", async () => {
    findRoom.mockResolvedValue({ creator: "user-1" })
    refreshAuth.mockResolvedValue({ accessToken: "atok", refreshToken: "rtok", expiresAt: 1 })

    const token = await provisionSpotifyTokenForRoom({ context, roomId: "room-1" })

    expect(token).toBe("atok")
    expect(refreshAuth).toHaveBeenCalledWith("user-1")
    expect(set).toHaveBeenCalledWith(spotifyTokenKey("room-1"), "atok", {
      EX: BRIDGE_SPOTIFY_TOKEN_TTL_SEC,
    })
  })

  it("falls back to stored token when refresh fails", async () => {
    findRoom.mockResolvedValue({ creator: "user-1" })
    refreshAuth.mockRejectedValue(new Error("refresh failed"))
    getUserServiceAuth.mockResolvedValue({ accessToken: "stored" })

    const token = await provisionSpotifyTokenForRoom({ context, roomId: "room-1" })

    expect(token).toBe("stored")
    expect(set).toHaveBeenCalledWith(spotifyTokenKey("room-1"), "stored", {
      EX: BRIDGE_SPOTIFY_TOKEN_TTL_SEC,
    })
  })
})

describe("wireSpotifyTokenProvisioning", () => {
  it("provisions on TOKEN_REQUEST", async () => {
    findRoom.mockResolvedValue({ creator: "user-1" })
    refreshAuth.mockResolvedValue({ accessToken: "atok", refreshToken: "rtok", expiresAt: 1 })

    const context = {
      redis: { pubClient: { set } },
      data: { getUserServiceAuth },
    } as any

    let listener: ((e: { type: "TOKEN_REQUEST"; service: "spotify" }) => void) | null = null
    wireSpotifyTokenProvisioning({
      context,
      roomId: "room-1",
      onEvent: (l) => {
        listener = l as typeof listener
        return () => {}
      },
    })

    // Wait for initial provision
    await vi.waitFor(() => expect(set).toHaveBeenCalled())
    set.mockClear()

    listener!({ type: "TOKEN_REQUEST", service: "spotify" })
    await vi.waitFor(() =>
      expect(set).toHaveBeenCalledWith(spotifyTokenKey("room-1"), "atok", {
        EX: BRIDGE_SPOTIFY_TOKEN_TTL_SEC,
      }),
    )
  })
})

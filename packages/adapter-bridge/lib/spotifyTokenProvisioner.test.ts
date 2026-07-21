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

  it("uses a still-fresh stored token without refreshing", async () => {
    findRoom.mockResolvedValue({ creator: "user-1" })
    getUserServiceAuth.mockResolvedValue({
      accessToken: "stored-fresh",
      refreshToken: "rtok",
      expiresAt: Date.now() + 3600_000,
    })

    const token = await provisionSpotifyTokenForRoom({ context, roomId: "room-1" })

    expect(token).toBe("stored-fresh")
    expect(refreshAuth).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith(spotifyTokenKey("room-1"), "stored-fresh", {
      EX: BRIDGE_SPOTIFY_TOKEN_TTL_SEC,
    })
  })

  it("refreshes and SETs the token key with EX when stored token is stale", async () => {
    findRoom.mockResolvedValue({ creator: "user-1" })
    getUserServiceAuth.mockResolvedValue({
      accessToken: "old",
      refreshToken: "rtok",
      expiresAt: Date.now() + 60_000, // within 5-minute window
    })
    refreshAuth.mockResolvedValue({
      accessToken: "atok",
      refreshToken: "rtok",
      expiresAt: Date.now() + 3600_000,
    })

    const token = await provisionSpotifyTokenForRoom({ context, roomId: "room-1" })

    expect(token).toBe("atok")
    expect(refreshAuth).toHaveBeenCalledWith("user-1")
    expect(set).toHaveBeenCalledWith(spotifyTokenKey("room-1"), "atok", {
      EX: BRIDGE_SPOTIFY_TOKEN_TTL_SEC,
    })
  })

  it("falls back to stored token when refresh fails", async () => {
    findRoom.mockResolvedValue({ creator: "user-1" })
    getUserServiceAuth.mockResolvedValue({ accessToken: "stored" })
    refreshAuth.mockRejectedValue(new Error("refresh failed"))

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
    getUserServiceAuth.mockResolvedValue({
      accessToken: "atok",
      refreshToken: "rtok",
      expiresAt: Date.now() + 3600_000,
    })
    refreshAuth.mockResolvedValue({
      accessToken: "atok",
      refreshToken: "rtok",
      expiresAt: Date.now() + 3600_000,
    })

    const context = {
      redis: { pubClient: { set } },
      data: { getUserServiceAuth },
    } as any

    let listener: ((e: { type: "TOKEN_REQUEST"; service: "spotify" }) => void) | null = null
    wireSpotifyTokenProvisioning({
      context,
      roomId: "room-wire-1",
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
      expect(set).toHaveBeenCalledWith(spotifyTokenKey("room-wire-1"), "atok", {
        EX: BRIDGE_SPOTIFY_TOKEN_TTL_SEC,
      }),
    )
  })
})

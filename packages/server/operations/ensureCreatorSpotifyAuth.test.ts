import { describe, it, expect, vi, beforeEach } from "vitest"
import { ensureCreatorSpotifyAuth } from "./ensureCreatorSpotifyAuth"
import { getUserServiceAuth, storeUserServiceAuth } from "./data/serviceAuthentications"
import { appContextFactory } from "@repo/factories"

vi.mock("./data/serviceAuthentications", () => ({
  getUserServiceAuth: vi.fn(),
  storeUserServiceAuth: vi.fn(),
}))

describe("ensureCreatorSpotifyAuth", () => {
  const context = appContextFactory.build()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns true when creator already has Spotify tokens", async () => {
    vi.mocked(getUserServiceAuth).mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
    })

    const result = await ensureCreatorSpotifyAuth({
      context,
      creatorUserId: "platform-1",
      sessionUserId: "spotify-legacy",
    })

    expect(result).toBe(true)
    expect(storeUserServiceAuth).not.toHaveBeenCalled()
  })

  it("copies tokens from session user id onto creator when creator has none", async () => {
    vi.mocked(getUserServiceAuth)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: 123,
      })

    const result = await ensureCreatorSpotifyAuth({
      context,
      creatorUserId: "platform-1",
      sessionUserId: "spotify-legacy",
    })

    expect(result).toBe(true)
    expect(storeUserServiceAuth).toHaveBeenCalledWith({
      context,
      userId: "platform-1",
      serviceName: "spotify",
      tokens: {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: 123,
        metadata: undefined,
      },
    })
  })

  it("returns false when neither creator nor session has tokens", async () => {
    vi.mocked(getUserServiceAuth).mockResolvedValue(null)

    const result = await ensureCreatorSpotifyAuth({
      context,
      creatorUserId: "platform-1",
      sessionUserId: "other",
    })

    expect(result).toBe(false)
    expect(storeUserServiceAuth).not.toHaveBeenCalled()
  })

  it("returns false on errors without throwing", async () => {
    vi.mocked(getUserServiceAuth).mockRejectedValue(new Error("redis down"))

    const result = await ensureCreatorSpotifyAuth({
      context,
      creatorUserId: "platform-1",
    })

    expect(result).toBe(false)
  })
})

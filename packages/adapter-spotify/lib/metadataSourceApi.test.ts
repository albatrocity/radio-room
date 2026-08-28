import { describe, it, expect, vi, beforeEach } from "vitest"
import { makeApi } from "./metadataSourceApi"

const search = vi.fn()
const getAccessToken = vi.fn()
const withAccessToken = vi.fn()
const getStoredTokens = vi.fn()
const refreshTokens = vi.fn()

vi.mock("@spotify/web-api-ts-sdk", () => ({
  SpotifyApi: {
    withAccessToken: (clientId: string, token: unknown, config: unknown) => {
      withAccessToken(clientId, token, config)
      return {
        getAccessToken,
        search,
      }
    },
  },
}))

const expiredError = new Error(
  "Bad or expired token. This can happen if the user revoked a token or the access token has expired. You should re-authenticate the user.",
)

async function buildApi(options?: { refreshTokens?: typeof refreshTokens }) {
  return makeApi({
    token: {
      access_token: "stale",
      refresh_token: "refresh",
      token_type: "Bearer",
      expires_in: 3600,
    },
    clientId: "client",
    config: {
      name: "spotify",
      authentication: {
        type: "oauth",
        getStoredTokens,
        ...(options?.refreshTokens ? { refreshTokens: options.refreshTokens } : {}),
      },
      onAuthenticationCompleted: vi.fn(),
    },
  })
}

describe("metadataSourceApi.search", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockResolvedValue({
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 3600,
    })
    getStoredTokens.mockResolvedValue({ accessToken: "fresh", refreshToken: "refresh" })
    refreshTokens.mockResolvedValue({ accessToken: "forced", refreshToken: "refresh" })
    search.mockResolvedValue({ tracks: { items: [] } })
  })

  it("loads stored tokens on each search instead of reusing the register snapshot", async () => {
    const api = await buildApi()
    getStoredTokens.mockResolvedValueOnce({ accessToken: "first", refreshToken: "refresh" })
    getStoredTokens.mockResolvedValueOnce({ accessToken: "second", refreshToken: "refresh" })

    await api.search("query one")
    await api.search("query two")

    const accessTokens = withAccessToken.mock.calls.map(
      (call) => (call[1] as { access_token: string }).access_token,
    )
    expect(accessTokens).toContain("first")
    expect(accessTokens).toContain("second")
    expect(getStoredTokens.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it("force-refreshes and retries once after a Spotify auth failure", async () => {
    const api = await buildApi({ refreshTokens })
    search.mockRejectedValueOnce(expiredError).mockResolvedValueOnce({ tracks: { items: [] } })

    await expect(api.search("neon")).resolves.toEqual([])

    expect(refreshTokens).toHaveBeenCalledOnce()
    expect(search).toHaveBeenCalledTimes(2)
    expect(
      withAccessToken.mock.calls.some(
        (call) => (call[1] as { access_token: string }).access_token === "forced",
      ),
    ).toBe(true)
  })

  it("does not refresh on non-auth failures", async () => {
    const api = await buildApi({ refreshTokens })
    search.mockRejectedValueOnce(new Error("Rate limited"))

    await expect(api.search("neon")).rejects.toThrow("Rate limited")
    expect(refreshTokens).not.toHaveBeenCalled()
  })
})

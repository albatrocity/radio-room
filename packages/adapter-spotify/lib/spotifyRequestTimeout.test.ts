import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchWithTimeout, spotifySdkConfig } from "./spotifyRequestTimeout"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

/** Never settles on its own, so only an abort can end the request. */
function stubHangingFetch() {
  const fetchMock = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
      }),
  )
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe("fetchWithTimeout", () => {
  it("aborts a request that never responds", async () => {
    stubHangingFetch()

    await expect(fetchWithTimeout("https://api.spotify.com/v1/me", {}, 20)).rejects.toThrow(
      "aborted",
    )
  })

  it("still times out when the caller supplies its own signal", async () => {
    stubHangingFetch()
    const callerSignal = new AbortController().signal

    await expect(
      fetchWithTimeout("https://api.spotify.com/v1/me", { signal: callerSignal }, 20),
    ).rejects.toThrow("aborted")
  })

  it("aborts when the caller's signal fires before the timeout", async () => {
    stubHangingFetch()
    const controller = new AbortController()
    const pending = fetchWithTimeout(
      "https://api.spotify.com/v1/me",
      { signal: controller.signal },
      60_000,
    )

    controller.abort()

    await expect(pending).rejects.toThrow("aborted")
  })

  it("passes request init through to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await fetchWithTimeout("https://accounts.spotify.com/api/token", { method: "POST" })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://accounts.spotify.com/api/token",
      expect.objectContaining({ method: "POST", signal: expect.anything() }),
    )
  })

  it("gives the Spotify SDK a fetch with an abort signal attached", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await spotifySdkConfig.fetch("https://api.spotify.com/v1/me")

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal!.aborted).toBe(false)
  })
})

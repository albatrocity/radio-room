import { describe, expect, it, vi } from "vitest"
import type { BridgeRequest, BridgeResponse } from "@repo/adapter-bridge/protocol"
import { RpcServer } from "./rpcServer"
import type { Router } from "./router"
import type { UrlSidechain } from "./drivers/urlPlayback"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal router spy — every method is a mock so tests can assert they are
 * NOT invoked when the request has `source: "url"`.
 */
function makeRouterSpy(): Router & {
  pauseMock: ReturnType<typeof vi.fn>
  playMock: ReturnType<typeof vi.fn>
  stopMock: ReturnType<typeof vi.fn>
  seekMock: ReturnType<typeof vi.fn>
  getPlaybackMock: ReturnType<typeof vi.fn>
} {
  const pauseMock = vi.fn(async () => undefined)
  const playMock = vi.fn(async () => undefined)
  const stopMock = vi.fn(async () => undefined)
  const seekMock = vi.fn(async () => undefined)
  const getPlaybackMock = vi.fn(async () => ({
    state: "playing",
    progressMs: 1,
    durationMs: 2,
    trackId: "programme",
  }))
  return {
    pause: pauseMock,
    play: playMock,
    stop: stopMock,
    seekTo: seekMock,
    getPlayback: getPlaybackMock,
    pauseMock,
    playMock,
    stopMock,
    seekMock,
    getPlaybackMock,
  } as unknown as Router & {
    pauseMock: ReturnType<typeof vi.fn>
    playMock: ReturnType<typeof vi.fn>
    stopMock: ReturnType<typeof vi.fn>
    seekMock: ReturnType<typeof vi.fn>
    getPlaybackMock: ReturnType<typeof vi.fn>
  }
}

function makeSidechainSpy(): UrlSidechain & {
  playUrlMock: ReturnType<typeof vi.fn>
  pauseMock: ReturnType<typeof vi.fn>
  resumeMock: ReturnType<typeof vi.fn>
  stopMock: ReturnType<typeof vi.fn>
  seekMock: ReturnType<typeof vi.fn>
  getStateMock: ReturnType<typeof vi.fn>
} {
  const playUrlMock = vi.fn(async () => ({ queued: true, mode: "replace", duck: true }))
  const pauseMock = vi.fn(async () => undefined)
  const resumeMock = vi.fn(async () => undefined)
  const stopMock = vi.fn(async () => undefined)
  const seekMock = vi.fn(async () => undefined)
  const getStateMock = vi.fn(async () => ({
    state: "paused",
    progressMs: 1200,
    durationMs: 5000,
  }))
  return {
    playUrl: playUrlMock,
    pause: pauseMock,
    resume: resumeMock,
    stop: stopMock,
    seekTo: seekMock,
    getState: getStateMock,
    playUrlMock,
    pauseMock,
    resumeMock,
    stopMock,
    seekMock,
    getStateMock,
  } as unknown as UrlSidechain & {
    playUrlMock: ReturnType<typeof vi.fn>
    pauseMock: ReturnType<typeof vi.fn>
    resumeMock: ReturnType<typeof vi.fn>
    stopMock: ReturnType<typeof vi.fn>
    seekMock: ReturnType<typeof vi.fn>
    getStateMock: ReturnType<typeof vi.fn>
  }
}

async function dispatch(
  router: Router,
  sidechain: UrlSidechain | null,
  request: BridgeRequest,
): Promise<BridgeResponse> {
  const responses: BridgeResponse[] = []
  const server = new RpcServer(
    () => () => undefined,
    (r) => responses.push(r),
    router,
    null,
    null,
    sidechain,
  )
  // Call the private dispatch via the public `start`/handleRequest path by
  // invoking the registered handler. Easier: reach through the private
  // handleRequest helper used by start.
  await (server as unknown as { handleRequest: (r: BridgeRequest) => Promise<void> })
    .handleRequest(request)
  if (responses.length !== 1) {
    throw new Error(`Expected 1 response, got ${responses.length}`)
  }
  return responses[0]!
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RpcServer.dispatch — URL sidechain branch", () => {
  it("playUrl calls the sidechain, not the Router", async () => {
    const router = makeRouterSpy()
    const sidechain = makeSidechainSpy()

    const res = await dispatch(router, sidechain, {
      id: "r-1",
      method: "playUrl",
      params: { url: "https://x/y.webm", mode: "replace", duck: true },
    })

    expect(res.ok).toBe(true)
    expect(sidechain.playUrlMock).toHaveBeenCalledWith({
      url: "https://x/y.webm",
      mode: "replace",
      duck: true,
    })
    expect(router.pauseMock).not.toHaveBeenCalled()
    expect(router.playMock).not.toHaveBeenCalled()
  })

  it("pause with source:url routes to the sidechain without touching the Router", async () => {
    const router = makeRouterSpy()
    const sidechain = makeSidechainSpy()

    const res = await dispatch(router, sidechain, {
      id: "r-2",
      method: "pause",
      params: { source: "url" },
    })

    expect(res.ok).toBe(true)
    expect(sidechain.pauseMock).toHaveBeenCalledTimes(1)
    expect(router.pauseMock).not.toHaveBeenCalled()
  })

  it("seekTo with source:url routes to the sidechain", async () => {
    const router = makeRouterSpy()
    const sidechain = makeSidechainSpy()

    const res = await dispatch(router, sidechain, {
      id: "r-3",
      method: "seekTo",
      params: { source: "url", positionMs: 2500 },
    })

    expect(res.ok).toBe(true)
    expect(sidechain.seekMock).toHaveBeenCalledWith(2500)
    expect(router.seekMock).not.toHaveBeenCalled()
  })

  it("getPlayback with source:url returns the sidechain state", async () => {
    const router = makeRouterSpy()
    const sidechain = makeSidechainSpy()

    const res = await dispatch(router, sidechain, {
      id: "r-4",
      method: "getPlayback",
      params: { source: "url" },
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual({
      state: "paused",
      progressMs: 1200,
      durationMs: 5000,
    })
    expect(router.getPlaybackMock).not.toHaveBeenCalled()
  })

  it("source:url getPlayback returns observed:false when no sidechain is wired (old pack)", async () => {
    const router = makeRouterSpy()

    const res = await dispatch(router, null, {
      id: "r-5",
      method: "getPlayback",
      params: { source: "url" },
    })

    expect(res.ok).toBe(true)
    expect(res.result).toEqual(
      expect.objectContaining({ observed: false, state: "stopped" }),
    )
    expect(router.getPlaybackMock).not.toHaveBeenCalled()
  })

  it("playTrack on a real source still flows through the Router", async () => {
    const router = makeRouterSpy()
    const sidechain = makeSidechainSpy()
    // playTrack has its own mock on this fake Router.
    ;(router as unknown as { playTrack: ReturnType<typeof vi.fn> }).playTrack = vi.fn(
      async () => undefined,
    )

    const res = await dispatch(router, sidechain, {
      id: "r-6",
      method: "playTrack",
      params: { source: "local", trackId: "t-1" },
    })

    expect(res.ok).toBe(true)
    expect(sidechain.playUrlMock).not.toHaveBeenCalled()
  })
})

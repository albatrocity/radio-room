import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EventEmitter } from "node:events"
import {
  isHttpsUrl,
  URL_PLAYBACK_ENQUEUE_MAX,
  UrlPlayback,
  UrlSidechain,
} from "./urlPlayback"

// ---------------------------------------------------------------------------
// Fake mpv IPC socket
// ---------------------------------------------------------------------------

/**
 * Tiny Writable-ish stub that:
 *   - records every JSON command written to it,
 *   - auto-replies success for `request_id`-bearing requests,
 *   - lets tests emit `event: end-file` from mpv.
 *
 * We attach it with `UrlPlayback.attachSocketForTests` so no mpv process is
 * spawned and no filesystem socket is needed.
 */
class FakeMpvSocket extends EventEmitter {
  readonly commands: Array<{ command: unknown[]; request_id?: number }> = []
  destroyed = false

  write(line: string): boolean {
    const payload = JSON.parse(line) as { command: unknown[]; request_id?: number }
    this.commands.push(payload)
    // Mirror mpv: reply with error: "success" for the request_id. Default
    // value: null unless the test queued one.
    if (payload.request_id != null) {
      queueMicrotask(() => {
        const queued = this.replies.shift()
        this.emit(
          "data",
          Buffer.from(
            JSON.stringify({
              request_id: payload.request_id,
              error: "success",
              data: queued ?? null,
            }) + "\n",
            "utf8",
          ),
        )
      })
    }
    return true
  }

  destroy() {
    this.destroyed = true
    this.emit("close")
  }

  /** Queue a `data` value to return from the next request. */
  queueReply(value: unknown) {
    this.replies.push(value)
  }

  /** Simulate mpv emitting end-file for the loaded URL. */
  emitEndFile(reason: "eof" | "error" | "stop" = "eof") {
    this.emit(
      "data",
      Buffer.from(JSON.stringify({ event: "end-file", reason }) + "\n", "utf8"),
    )
  }

  private readonly replies: unknown[] = []
}

function attachFake(player: UrlPlayback): FakeMpvSocket {
  const sock = new FakeMpvSocket()
  // UrlPlayback's test hook accepts the Node Socket shape; EventEmitter + .write
  // is enough for the handful of methods it touches.
  player.attachSocketForTests(sock as unknown as import("node:net").Socket)
  return sock
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePlayer(audioDevice: string | undefined) {
  return new UrlPlayback({
    label: "url-ducked",
    getMpvPath: () => "/opt/homebrew/bin/mpv",
    getAudioDevice: () => audioDevice,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// isHttpsUrl
// ---------------------------------------------------------------------------

describe("isHttpsUrl", () => {
  it("accepts https URLs", () => {
    expect(isHttpsUrl("https://example.com/vm.webm")).toBe(true)
  })

  it("rejects http, file, ftp, and garbage", () => {
    expect(isHttpsUrl("http://example.com/vm.webm")).toBe(false)
    expect(isHttpsUrl("file:///Users/me/vm.webm")).toBe(false)
    expect(isHttpsUrl("ftp://example.com/vm.webm")).toBe(false)
    expect(isHttpsUrl("not a url")).toBe(false)
    expect(isHttpsUrl("")).toBe(false)
    expect(isHttpsUrl(42 as unknown as string)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// UrlPlayback behavior (with attached fake socket)
// ---------------------------------------------------------------------------

describe("UrlPlayback", () => {
  it("rejects non-https URLs before touching mpv", async () => {
    const player = makePlayer("coreaudio/BlackHole2ch_UID")
    const sock = attachFake(player)

    await expect(player.play({ url: "http://example.com/x.webm" })).rejects.toThrow(
      /https/i,
    )
    expect(sock.commands).toEqual([])
  })

  it("loadfile replace clears the pending queue for this player", async () => {
    const player = makePlayer("coreaudio/BlackHole2ch_UID")
    const sock = attachFake(player)

    // Prime the queue via enqueue, then replace.
    await player.play({ url: "https://example.com/a.webm", mode: "enqueue" })
    await player.play({ url: "https://example.com/b.webm", mode: "enqueue" })
    expect(player.queueDepthForTests()).toBe(1)

    await player.play({ url: "https://example.com/c.webm", mode: "replace" })

    expect(player.queueDepthForTests()).toBe(0)
    const loads = sock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "loadfile",
    )
    // Final load is the replace URL.
    expect(loads.at(-1)?.command).toEqual(["loadfile", "https://example.com/c.webm", "replace"])
  })

  it("enqueue appends and advances on natural EOF", async () => {
    const player = makePlayer("coreaudio/BlackHole2ch_UID")
    const sock = attachFake(player)

    await player.play({ url: "https://example.com/a.webm", mode: "replace" })
    await player.play({ url: "https://example.com/b.webm", mode: "enqueue" })
    expect(player.queueDepthForTests()).toBe(1)

    // UrlPlayback ignores end-file for 2s after a loadfile (so mpv's "stop"
    // event from loadfile replace doesn't fire the advance). Jump past that
    // window before emitting the natural EOF.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3000)
    try {
      sock.emitEndFile("eof")
      await new Promise((r) => setTimeout(r, 20))
    } finally {
      nowSpy.mockRestore()
    }

    expect(player.queueDepthForTests()).toBe(0)
    const loads = sock.commands
      .filter((c) => Array.isArray(c.command) && c.command[0] === "loadfile")
      .map((c) => c.command)
    expect(loads).toEqual([
      ["loadfile", "https://example.com/a.webm", "replace"],
      ["loadfile", "https://example.com/b.webm", "replace"],
    ])
  })

  it("rejects a ninth enqueue when the queue is full", async () => {
    const player = makePlayer("coreaudio/BlackHole2ch_UID")
    attachFake(player)

    // First call promotes to loaded (not counted in queue). Fill the remaining
    // queue up to the cap, then verify the next enqueue is rejected.
    await player.play({ url: "https://example.com/0.webm", mode: "enqueue" })
    for (let i = 1; i <= URL_PLAYBACK_ENQUEUE_MAX; i += 1) {
      await player.play({ url: `https://example.com/${i}.webm`, mode: "enqueue" })
    }
    expect(player.queueDepthForTests()).toBe(URL_PLAYBACK_ENQUEUE_MAX)

    await expect(
      player.play({ url: "https://example.com/overflow.webm", mode: "enqueue" }),
    ).rejects.toThrow(/queue is full/i)
  })

  it("stop clears the queue and loaded URL", async () => {
    const player = makePlayer("coreaudio/BlackHole2ch_UID")
    const sock = attachFake(player)

    await player.play({ url: "https://example.com/a.webm", mode: "replace" })
    await player.play({ url: "https://example.com/b.webm", mode: "enqueue" })

    await player.stop()
    expect(player.queueDepthForTests()).toBe(0)
    const stops = sock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "stop",
    )
    expect(stops.length).toBeGreaterThanOrEqual(1)
  })

  it("getState returns observed:false when the socket has not started", async () => {
    const player = makePlayer("coreaudio/BlackHole2ch_UID")
    // Do NOT attach a socket.
    const state = await player.getState()
    expect(state.observed).toBe(false)
    expect(state.state).toBe("stopped")
  })
})

// ---------------------------------------------------------------------------
// UrlSidechain composition
// ---------------------------------------------------------------------------

describe("UrlSidechain", () => {
  let sidechain: UrlSidechain
  let duckedSock: FakeMpvSocket
  let drySock: FakeMpvSocket
  let audioDevice: string | undefined

  beforeEach(() => {
    audioDevice = "coreaudio/BlackHole2ch_UID"
    sidechain = new UrlSidechain({
      getMpvPath: () => "/opt/homebrew/bin/mpv",
      getDuckedAudioDevice: () => audioDevice,
    })
    duckedSock = attachFake(sidechain.ducked)
    drySock = attachFake(sidechain.dry)
  })

  it("duck:true loads on the ducked player and leaves the dry player alone", async () => {
    const result = await sidechain.playUrl({
      url: "https://example.com/vm.webm",
      mode: "replace",
      duck: true,
    })

    expect(result).toEqual({ queued: true, mode: "replace", duck: true })
    const duckedLoads = duckedSock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "loadfile",
    )
    const dryLoads = drySock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "loadfile",
    )
    expect(duckedLoads).toHaveLength(1)
    expect(dryLoads).toHaveLength(0)
  })

  it("duck:false enqueues on the dry player without touching the ducked file", async () => {
    // Prime ducked with a replace so a subsequent dry enqueue is isolated.
    await sidechain.playUrl({
      url: "https://example.com/ducked.webm",
      mode: "replace",
      duck: true,
    })
    const duckedLoadsBefore = duckedSock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "loadfile",
    ).length

    await sidechain.playUrl({
      url: "https://example.com/dry-a.webm",
      mode: "enqueue",
      duck: false,
    })

    const duckedLoadsAfter = duckedSock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "loadfile",
    ).length
    const dryLoads = drySock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "loadfile",
    )
    expect(duckedLoadsAfter).toBe(duckedLoadsBefore) // untouched
    expect(dryLoads).toHaveLength(1) // first enqueue promotes to loaded
  })

  it("duck:true fails closed when tts.audioDevice is unset", async () => {
    audioDevice = undefined

    await expect(
      sidechain.playUrl({
        url: "https://example.com/vm.webm",
        mode: "replace",
        duck: true,
      }),
    ).rejects.toThrow(/TTS audio device/i)

    // No load should have happened on either player.
    const loads = [...duckedSock.commands, ...drySock.commands].filter(
      (c) => Array.isArray(c.command) && c.command[0] === "loadfile",
    )
    expect(loads).toHaveLength(0)
  })

  it("duck:false still works when tts.audioDevice is unset", async () => {
    audioDevice = undefined

    const result = await sidechain.playUrl({
      url: "https://example.com/dry.webm",
      mode: "replace",
      duck: false,
    })

    expect(result.duck).toBe(false)
    const dryLoads = drySock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "loadfile",
    )
    expect(dryLoads).toHaveLength(1)
  })

  it("ducked and dry queues are independent — a full ducked queue does not block the dry player", async () => {
    // Fill the ducked player's queue to the cap.
    await sidechain.playUrl({
      url: "https://example.com/d-0.webm",
      mode: "enqueue",
      duck: true,
    })
    for (let i = 1; i <= URL_PLAYBACK_ENQUEUE_MAX; i += 1) {
      await sidechain.playUrl({
        url: `https://example.com/d-${i}.webm`,
        mode: "enqueue",
        duck: true,
      })
    }
    await expect(
      sidechain.playUrl({
        url: "https://example.com/d-overflow.webm",
        mode: "enqueue",
        duck: true,
      }),
    ).rejects.toThrow(/queue is full/i)

    // Dry player still accepts work.
    const result = await sidechain.playUrl({
      url: "https://example.com/dry.webm",
      mode: "enqueue",
      duck: false,
    })
    expect(result.duck).toBe(false)
    expect(result.queued).toBe(true)
  })

  it("stop targets only the ducked player", async () => {
    await sidechain.playUrl({
      url: "https://example.com/ducked.webm",
      mode: "replace",
      duck: true,
    })
    await sidechain.playUrl({
      url: "https://example.com/dry.webm",
      mode: "replace",
      duck: false,
    })

    await sidechain.stop()

    const duckedStops = duckedSock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "stop",
    )
    const dryStops = drySock.commands.filter(
      (c) => Array.isArray(c.command) && c.command[0] === "stop",
    )
    expect(duckedStops.length).toBeGreaterThan(0)
    expect(dryStops).toHaveLength(0)
  })
})

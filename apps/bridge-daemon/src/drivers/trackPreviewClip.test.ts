import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "node:events"
import { PREVIEW_DURATION_SEC, computePreviewStartSec } from "./trackPreviewClip"

const mockSpawn = vi.fn()

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

vi.mock("../resolveMacBinary", () => ({
  resolveMacBinary: (name: string) => name,
}))

type MockProc = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
}

function enqueueSpawnSuccess(mp3Bytes: Buffer) {
  mockSpawn.mockImplementationOnce(() => {
    const proc = new EventEmitter() as MockProc
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    setImmediate(() => {
      proc.stdout.emit("data", mp3Bytes)
      proc.emit("close", 0)
    })
    return proc
  })
}

function enqueueSpawnVersionOk() {
  mockSpawn.mockImplementationOnce((cmd: string) => {
    const proc = new EventEmitter() as MockProc
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    setImmediate(() => {
      proc.emit("close", String(cmd).endsWith("ffmpeg") ? 0 : 1)
    })
    return proc
  })
}

function enqueueSpawnError(message: string) {
  mockSpawn.mockImplementationOnce(() => {
    const proc = new EventEmitter() as MockProc
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    setImmediate(() => {
      proc.stderr.emit("data", Buffer.from(message))
      proc.emit("close", 1)
    })
    return proc
  })
}

describe("trackPreviewClip", () => {
  beforeEach(() => {
    mockSpawn.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test("computePreviewStartSec centers a long track", () => {
    expect(computePreviewStartSec(300)).toBe(300 / 2 - PREVIEW_DURATION_SEC / 2)
    expect(computePreviewStartSec(10)).toBe(0)
  })

  test("encodeTrackPreviewClip returns base64 mp3 bytes", async () => {
    const { encodeTrackPreviewClip } = await import("./trackPreviewClip")
    const fakeMp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00])
    enqueueSpawnSuccess(fakeMp3)
    const result = await encodeTrackPreviewClip({
      trackId: "t1",
      input: "/music/track.flac",
      durationSec: 240,
    })
    expect(result.mimeType).toBe("audio/mpeg")
    expect(Buffer.from(result.data, "base64")).toEqual(fakeMp3)
    expect(result.durationMs).toBe(PREVIEW_DURATION_SEC * 1000)
  })

  test("encodeTrackPreviewClip surfaces ffmpeg errors", async () => {
    const { encodeTrackPreviewClip } = await import("./trackPreviewClip")
    enqueueSpawnError("No such file")
    await expect(
      encodeTrackPreviewClip({ trackId: "t2", input: "/missing.flac", durationSec: 180 }),
    ).rejects.toThrow(/No such file/)
  })

  test("assertPreviewDependencies rejects missing musicFolder", async () => {
    const { assertPreviewDependencies } = await import("./trackPreviewClip")
    await expect(assertPreviewDependencies(undefined)).rejects.toThrow(/musicFolder/)
    await expect(assertPreviewDependencies("  ")).rejects.toThrow(/musicFolder/)
  })

  test("ffmpegAvailable returns false when spawn fails", async () => {
    mockSpawn.mockImplementationOnce(() => {
      const proc = new EventEmitter() as MockProc
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      setImmediate(() => proc.emit("error", new Error("ENOENT")))
      return proc
    })
    const { ffmpegAvailable } = await import("./trackPreviewClip")
    await expect(ffmpegAvailable()).resolves.toBe(false)
  })
})

import { afterEach, describe, expect, it } from "vitest"
import { applyEnvOverrides, type BridgeDaemonConfig } from "./config"

function baseConfig(overrides: Partial<BridgeDaemonConfig> = {}): BridgeDaemonConfig {
  return {
    redisUrl: "redis://127.0.0.1:6379",
    httpListen: "127.0.0.1:18766",
    services: ["youtube", "local"],
    chrome: {
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      debuggingPort: 9222,
    },
    tidal: {
      executablePath: "/Applications/TIDAL.app/Contents/MacOS/TIDAL",
      debuggingPort: 9223,
    },
    navidrome: {
      url: "http://127.0.0.1:4533",
      username: "",
      password: "",
      publicUrlTagPriority: ["wcom"],
    },
    mpv: { path: "mpv" },
    nowPlayingFormat: "{title} | {artist} | {album}",
    ...overrides,
  } as BridgeDaemonConfig
}

describe("applyEnvOverrides now playing path", () => {
  const prev = process.env.BRIDGE_NOW_PLAYING_PATH

  afterEach(() => {
    if (prev === undefined) delete process.env.BRIDGE_NOW_PLAYING_PATH
    else process.env.BRIDGE_NOW_PLAYING_PATH = prev
  })

  it("fills nowPlayingPath from BRIDGE_NOW_PLAYING_PATH when unset", () => {
    process.env.BRIDGE_NOW_PLAYING_PATH = "~/Now Playing.txt"
    const next = applyEnvOverrides(baseConfig())
    expect(next.nowPlayingPath).toBe("~/Now Playing.txt")
  })

  it("does not override an explicit bridge config path", () => {
    process.env.BRIDGE_NOW_PLAYING_PATH = "~/Now Playing.txt"
    const next = applyEnvOverrides(baseConfig({ nowPlayingPath: "/tmp/custom.txt" }))
    expect(next.nowPlayingPath).toBe("/tmp/custom.txt")
  })
})

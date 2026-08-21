import { describe, expect, test } from "vitest"
import { resolveMacBinary } from "./resolveMacBinary"

describe("resolveMacBinary", () => {
  test("uses an existing configured absolute path", () => {
    expect(
      resolveMacBinary("ffmpeg", "/opt/custom/bin/ffmpeg", {
        exists: (p) => p === "/opt/custom/bin/ffmpeg",
        which: () => undefined,
      }),
    ).toBe("/opt/custom/bin/ffmpeg")
  })

  test("finds Homebrew Apple Silicon path when Terminal PATH is unavailable", () => {
    expect(
      resolveMacBinary("ffmpeg", "ffmpeg", {
        exists: (p) => p === "/opt/homebrew/bin/ffmpeg",
        which: () => undefined,
      }),
    ).toBe("/opt/homebrew/bin/ffmpeg")
  })

  test("finds Intel Homebrew path", () => {
    expect(
      resolveMacBinary("mpv", "mpv", {
        exists: (p) => p === "/usr/local/bin/mpv",
        which: () => undefined,
      }),
    ).toBe("/usr/local/bin/mpv")
  })

  test("falls back to which when Homebrew dirs miss", () => {
    expect(
      resolveMacBinary("ffmpeg", "ffmpeg", {
        exists: (p) => p === "/nix/store/ffmpeg",
        which: () => "/nix/store/ffmpeg",
      }),
    ).toBe("/nix/store/ffmpeg")
  })

  test("returns the configured name when nothing exists", () => {
    expect(
      resolveMacBinary("ffmpeg", "ffmpeg", {
        exists: () => false,
        which: () => undefined,
      }),
    ).toBe("ffmpeg")
  })
})

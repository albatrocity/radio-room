import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { defaultNowPlayingPath, expandUserPath, resolveNowPlayingPath } from "./config"
import { formatAudioHijackNowPlaying, NowPlayingPublisher } from "./nowPlaying"

describe("expandUserPath / resolveNowPlayingPath", () => {
  const home = "/Users/dj"

  it("expands ~/Now Playing.txt to the home directory", () => {
    expect(expandUserPath("~/Now Playing.txt", home)).toBe("/Users/dj/Now Playing.txt")
  })

  it("defaults to ~/Now Playing.txt (Audio Hijack / local-remote path)", () => {
    expect(defaultNowPlayingPath(home)).toBe("/Users/dj/Now Playing.txt")
    expect(resolveNowPlayingPath(undefined, home)).toBe("/Users/dj/Now Playing.txt")
    expect(resolveNowPlayingPath("  ", home)).toBe("/Users/dj/Now Playing.txt")
  })

  it("resolves a bare filename against home, not the daemon cwd", () => {
    expect(resolveNowPlayingPath("Now Playing.txt", home)).toBe("/Users/dj/Now Playing.txt")
  })

  it("keeps absolute paths", () => {
    expect(resolveNowPlayingPath("/tmp/Now Playing.txt", home)).toBe("/tmp/Now Playing.txt")
  })
})

describe("formatAudioHijackNowPlaying", () => {
  it("writes labeled fields Audio Hijack reads", () => {
    expect(formatAudioHijackNowPlaying({ title: "Song", artist: "Artist", album: "Album" })).toBe(
      "Title: Song\nArtist: Artist\nAlbum: Album\n",
    )
  })
})

describe("NowPlayingPublisher.writeFile", () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  function publisher(filePath: string | (() => string)) {
    return new NowPlayingPublisher({ publish: async () => 1 } as never, filePath)
  }

  it("writes Title/Artist/Album lines", () => {
    const dir = mkdtempSync(join(tmpdir(), "np-"))
    dirs.push(dir)
    const path = join(dir, "Now Playing.txt")
    publisher(path).writeFile({ title: "Song", artist: "Artist", album: "LP" })
    expect(readFileSync(path, "utf8")).toBe("Title: Song\nArtist: Artist\nAlbum: LP\n")
  })

  it("does not wipe an existing file when title is empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "np-"))
    dirs.push(dir)
    const path = join(dir, "Now Playing.txt")
    const pub = publisher(path)
    pub.writeFile({ title: "Keep Me" })
    pub.writeFile({ title: "  " })
    expect(readFileSync(path, "utf8")).toContain("Title: Keep Me")
  })
})

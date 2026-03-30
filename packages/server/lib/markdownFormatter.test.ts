import { describe, it, expect } from "vitest"
import type { RoomExportData } from "@repo/types"
import { formatRoomExportAsMarkdown, yamlDoubleQuotedScalar } from "./markdownFormatter"

function minimalExport(overrides: Partial<RoomExportData> = {}): RoomExportData {
  return {
    exportedAt: "2025-12-15T18:30:00.000Z",
    room: {
      id: "room_1",
      title: "Magic Machine Listening Party",
      description: "Listening party to celebrate the Magic Machine release.",
      type: "radio",
      createdAt: "2025-01-01T00:00:00.000Z",
      creator: "user_1",
    },
    users: [],
    userHistory: [{ id: "u1", username: "a" } as any, { id: "u2", username: "b" } as any],
    playlist: [{}, {}] as any,
    chat: [{}, {}, {}] as any,
    queue: [],
    reactions: { message: {}, track: {} },
    ...overrides,
  }
}

describe("yamlDoubleQuotedScalar", () => {
  it("escapes quotes, backslashes, and newlines", () => {
    expect(yamlDoubleQuotedScalar(`He said "hi"`)).toBe(`"He said \\"hi\\""`)
    expect(yamlDoubleQuotedScalar("a\\b")).toBe(`"a\\\\b"`)
    expect(yamlDoubleQuotedScalar("line1\nline2")).toBe(`"line1\\nline2"`)
  })
})

describe("formatRoomExportAsMarkdown frontmatter", () => {
  it("prepends YAML with stats and intro from export data", () => {
    const md = formatRoomExportAsMarkdown(minimalExport(), [], undefined, "room_1")
    expect(md.startsWith("---\n")).toBe(true)
    expect(md).toContain('title: "Magic Machine Listening Party"')
    expect(md).toContain("date: 2025-12-15")
    expect(md).toContain("description:")
    expect(md).toContain("stats:")
    expect(md).toContain("  tracks: 2")
    expect(md).toContain("  messages: 3")
    expect(md).toContain("  visitors: 2")
    expect(md).toContain("_2 tracks played • 3 messages • 2 unique visitors_")
    expect(md).toContain("*Exported on")
    expect(md).not.toContain("# Magic Machine")
  })

  it("omits description line when room has no description and none passed", () => {
    const base = minimalExport()
    const data: RoomExportData = {
      ...base,
      room: {
        id: base.room.id,
        title: base.room.title,
        type: base.room.type,
        createdAt: base.room.createdAt,
        creator: base.room.creator,
      },
    }
    const md = formatRoomExportAsMarkdown(data, [], undefined, "room_1")
    expect(md).not.toContain("\ndescription:")
  })

  it("adds playlist URLs and bullets when overrides include tidal and spotify", () => {
    const tidal = "https://tidal.com/playlist/abc"
    const spotify = "https://open.spotify.com/playlist/xyz"
    const md = formatRoomExportAsMarkdown(minimalExport(), [], undefined, "room_1", {
      frontmatter: {
        title: "Show Title",
        date: "2025-06-01",
        tidalPlaylist: tidal,
        spotifyPlaylist: spotify,
      },
    })
    expect(md).toContain(`tidalPlaylist: "${tidal}"`)
    expect(md).toContain(`spotifyPlaylist: "${spotify}"`)
    expect(md).toContain(`- [Tidal playlist](${tidal})`)
    expect(md).toContain(`- [Spotify playlist](${spotify})`)
  })
})

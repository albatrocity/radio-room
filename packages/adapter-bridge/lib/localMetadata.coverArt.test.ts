import { describe, expect, it, vi } from "vitest"
import { normalizePlaylistCoverArtResult } from "./localMetadata"

describe("normalizePlaylistCoverArtResult", () => {
  it("maps a legacy flat data-URI record onto sm", () => {
    expect(
      normalizePlaylistCoverArtResult({
        "nd-lp": "data:image/jpeg;base64,abc",
        skip: "https://example/not-a-data-uri",
      }),
    ).toEqual({ "nd-lp": { sm: "data:image/jpeg;base64,abc" } })
  })

  it("keeps nested sm/lg variants", () => {
    expect(
      normalizePlaylistCoverArtResult({
        "nd-lp": {
          sm: "data:image/jpeg;base64,sm",
          lg: "data:image/jpeg;base64,lg",
        },
      }),
    ).toEqual({
      "nd-lp": { sm: "data:image/jpeg;base64,sm", lg: "data:image/jpeg;base64,lg" },
    })
  })

  it("returns {} for non-objects", () => {
    expect(normalizePlaylistCoverArtResult(null)).toEqual({})
    expect(normalizePlaylistCoverArtResult("nope")).toEqual({})
  })
})

describe("getLocalPlaylistCoverArt batching", () => {
  it("chunks playlist ids across Redis RPCs", async () => {
    const { getLocalPlaylistCoverArt, LOCAL_COVER_ART_ID_BATCH } = await import("./localMetadata")
    const call = vi.fn(async (_method: string, args: { playlistIds: string[] }) => {
      const out: Record<string, { sm: string }> = {}
      for (const id of args.playlistIds) {
        out[id] = { sm: "data:image/jpeg;base64,aa" }
      }
      return out
    })
    const rpc = {
      isPresent: async () => true,
      call,
    }
    const ids = Array.from({ length: LOCAL_COVER_ART_ID_BATCH + 2 }, (_, i) => `p${i}`)
    const result = await getLocalPlaylistCoverArt({
      rpc: rpc as never,
      playlistIds: ids,
    })
    expect(call).toHaveBeenCalledTimes(2)
    expect(call.mock.calls[0]?.[1]?.playlistIds).toHaveLength(LOCAL_COVER_ART_ID_BATCH)
    expect(Object.keys(result)).toHaveLength(ids.length)
  })
})

import { describe, expect, it, vi } from "vitest"
import {
  checkLocalTrackPlaylistMembership,
  checkLocalTrackPlaylistMembershipBatch,
} from "./localMetadata"
import type { BridgeRpcClient } from "./rpcClient"

function rpcStub(call: BridgeRpcClient["call"]): BridgeRpcClient {
  return {
    isPresent: async () => true,
    call,
  } as BridgeRpcClient
}

describe("checkLocalTrackPlaylistMembershipBatch", () => {
  it("uses byTrackId when the daemon returns a batch bag", async () => {
    const call = vi.fn(async () => ({
      byTrackId: {
        a: { playlistIds: ["pl-1"], albumIds: [] },
        b: { playlistIds: [], albumIds: ["al-1"] },
      },
    }))
    const result = await checkLocalTrackPlaylistMembershipBatch({
      rpc: rpcStub(call),
      trackIds: ["a", "b"],
      playlistIds: ["pl-1"],
      includeTrackAlbumId: true,
    })
    expect(call).toHaveBeenCalledTimes(1)
    expect(result.get("a")).toEqual({ playlistIds: ["pl-1"], albumIds: [] })
    expect(result.get("b")).toEqual({ playlistIds: [], albumIds: ["al-1"] })
  })

  it("falls back per-track when the daemon returns a single-track bag", async () => {
    const call = vi.fn(async (_method: string, params: Record<string, unknown>) => {
      const id = String(params.trackId ?? "")
      return { playlistIds: id === "a" ? ["pl-a"] : ["pl-b"], albumIds: [] }
    })
    const result = await checkLocalTrackPlaylistMembershipBatch({
      rpc: rpcStub(call),
      trackIds: ["a", "b"],
      playlistIds: ["pl-1"],
    })
    expect(call.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(result.get("a")?.playlistIds).toEqual(["pl-a"])
    expect(result.get("b")?.playlistIds).toEqual(["pl-b"])
  })
})

describe("checkLocalTrackPlaylistMembership", () => {
  it("parses the object membership shape", async () => {
    const call = vi.fn(async () => ({ playlistIds: ["pl-1"], albumIds: ["al-1"] }))
    await expect(
      checkLocalTrackPlaylistMembership({
        rpc: rpcStub(call),
        trackId: "t1",
        playlistIds: ["pl-1"],
      }),
    ).resolves.toEqual({ playlistIds: ["pl-1"], albumIds: ["al-1"] })
  })
})

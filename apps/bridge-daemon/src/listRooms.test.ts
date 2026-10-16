import { afterEach, describe, expect, it, vi } from "vitest"
import { listRoomsFromApi, sortDiscoveredRooms, type DiscoveredRoom } from "./listRooms"

const room = (partial: Partial<DiscoveredRoom> & Pick<DiscoveredRoom, "id" | "title">): DiscoveredRoom => ({
  type: "radio",
  playbackControllerId: "spotify",
  playbackMode: "app-controlled",
  public: true,
  bridgeReady: false,
  ...partial,
})

describe("listRoomsFromApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads the authenticated room list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rooms: [
          room({ id: "b", title: "Bridge Room", playbackControllerId: "bridge", bridgeReady: true, public: false }),
          room({ id: "a", title: "Spotify Room" }),
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const rooms = await listRoomsFromApi("http://127.0.0.1:3000/", "secret")
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/api/device/rooms", {
      headers: { Authorization: "Bearer secret" },
    })
    expect(rooms[0].id).toBe("b")
    expect(rooms[0].bridgeReady).toBe(true)
    expect(rooms[1].id).toBe("a")
  })

  it("sorts bridge rooms first when the payload is unsorted", () => {
    const rooms = sortDiscoveredRooms([
      room({ id: "a", title: "Spotify Room" }),
      room({ id: "b", title: "Bridge Room", playbackControllerId: "bridge", bridgeReady: true }),
    ])
    expect(rooms.map((r) => r.id)).toEqual(["b", "a"])
  })
})

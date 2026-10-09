import { describe, expect, it } from "vitest"
// Exercise the same helper the shoutcast adapter job uses (monorepo path; not a runtime dep).
import getStation from "../../../packages/adapter-shoutcast/lib/shoutcast"
import { fixturePath } from "./config.js"
import { NowPlayingController } from "./nowPlaying.js"
import { createStreamServer, listen } from "./streamServer.js"

describe("node-internet-radio raw compatibility", () => {
  it("parses StreamTitle from the ephemeral ICY stream", async () => {
    const np = new NowPlayingController(0)
    np.setTrack(
      { title: "Compat Track", artist: "Adapter", album: "Shoutcast" },
      "manual",
    )
    const stream = createStreamServer({
      host: "127.0.0.1",
      port: 0,
      mp3Path: fixturePath("loop.mp3"),
      metaint: 800,
      bitrateKbps: 128,
      nowPlaying: np,
    })
    await listen(stream, "127.0.0.1", 0)

    try {
      const station = await getStation(stream.streamUrl, "raw")
      expect(station.title).toContain("Compat Track")
      expect(station.title).toContain("Adapter")
      expect(station.title).toContain("Shoutcast")
    } finally {
      await stream.close()
      np.stop()
    }
  }, 15_000)
})

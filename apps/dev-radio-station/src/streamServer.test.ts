import { afterEach, describe, expect, it } from "vitest"
import { fixturePath } from "./config.js"
import { NowPlayingController } from "./nowPlaying.js"
import { createStreamServer, listen } from "./streamServer.js"

async function withServer(
  run: (baseUrl: string, np: NowPlayingController) => Promise<void>,
): Promise<void> {
  const np = new NowPlayingController(0)
  const stream = createStreamServer({
    host: "127.0.0.1",
    port: 0,
    mp3Path: fixturePath("loop.mp3"),
    metaint: 1600,
    bitrateKbps: 128,
    nowPlaying: np,
  })
  await listen(stream, "127.0.0.1", 0)
  try {
    await run(stream.url, np)
  } finally {
    await stream.close()
    np.stop()
  }
}

describe("createStreamServer", () => {
  afterEach(() => {
    // ensure no dangling handles from failed cases
  })

  it("serves /health with CORS and current now-playing", async () => {
    await withServer(async (baseUrl, np) => {
      np.setTrack({ title: "Health", artist: "Test", album: "Suite" }, "manual")
      const res = await fetch(`${baseUrl}/health`)
      expect(res.status).toBe(200)
      expect(res.headers.get("access-control-allow-origin")).toBe("*")
      const body = (await res.json()) as {
        ok: boolean
        nowPlaying: { title: string; streamTitle: string }
      }
      expect(body.ok).toBe(true)
      expect(body.nowPlaying.title).toBe("Health")
      expect(body.nowPlaying.streamTitle).toBe("Health | Test | Suite")
    })
  })

  it("accepts POST /now-playing", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/now-playing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Manual", artist: "DJ", album: "Dev" }),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; nowPlaying: { source: string } }
      expect(body.ok).toBe(true)
      expect(body.nowPlaying.source).toBe("manual")
    })
  })

  it("streams MP3 with ICY metadata when requested", async () => {
    await withServer(async (baseUrl, np) => {
      np.setTrack({ title: "Icy Song", artist: "Meta", album: "Data" }, "manual")
      const res = await fetch(`${baseUrl}/stream`, {
        headers: { "Icy-Metadata": "1" },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get("icy-metaint")).toBe("1600")
      expect(res.headers.get("content-type")).toContain("audio/mpeg")
      expect(res.headers.get("access-control-allow-origin")).toBe("*")

      const reader = res.body?.getReader()
      expect(reader).toBeTruthy()
      const chunks: Uint8Array[] = []
      while (chunks.reduce((n, c) => n + c.length, 0) < 4000) {
        const { done, value } = await reader!.read()
        if (done) break
        if (value) chunks.push(value)
      }
      await reader!.cancel()
      const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)))
      expect(buf.toString("utf8")).toContain("StreamTitle='Icy Song | Meta | Data';")
    })
  })

  it("streams plain MP3 without icy-metaint when metadata is not requested", async () => {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/stream`)
      expect(res.status).toBe(200)
      expect(res.headers.get("icy-metaint")).toBeNull()
      const reader = res.body?.getReader()
      const { value } = await reader!.read()
      await reader!.cancel()
      expect(value && value.length > 0).toBe(true)
      expect(Buffer.from(value!).toString("utf8")).not.toContain("StreamTitle=")
    })
  })
})

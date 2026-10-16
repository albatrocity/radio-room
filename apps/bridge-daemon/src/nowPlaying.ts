import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname } from "node:path"
import { resolveNowPlayingPath } from "./config"

export type NowPlayingMeta = {
  title?: string
  artist?: string
  album?: string
  mediaSource?: { type: string; trackId: string }
}

/**
 * Audio Hijack reads Now Playing.txt as labeled fields, not a single formatted line.
 * @see https://www.rogueamoeba.com/support/knowledgebase/?showArticle=AudioHijack-Metadata
 *
 * Title Format in Audio Hijack (e.g. `{title} | {artist} | {album}`) is configured
 * in the Broadcast/Live Stream block — not in this file.
 */
export function formatAudioHijackNowPlaying(meta: {
  title?: string
  artist?: string
  album?: string
}): string {
  return [
    `Title: ${meta.title ?? ""}`,
    `Artist: ${meta.artist ?? ""}`,
    `Album: ${meta.album ?? ""}`,
    "",
  ].join("\n")
}

export type NowPlayingPoster = (roomId: string, meta: NowPlayingMeta) => Promise<void>

export async function postNowPlaying(
  apiBaseUrl: string,
  bearer: string,
  roomId: string,
  meta: NowPlayingMeta,
): Promise<void> {
  const base = apiBaseUrl.replace(/\/$/, "")
  const res = await fetch(`${base}/api/device/now-playing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      roomId,
      title: meta.title ?? "",
      artist: meta.artist ?? "",
      album: meta.album ?? "",
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`now-playing ${res.status} ${text.slice(0, 200)}`)
  }
}

export class NowPlayingPublisher {
  private lastContent = ""
  private lastPath = ""

  constructor(
    private readonly post: NowPlayingPoster,
    /** Absolute, `~/…`, or getter so a UI save takes effect without reconnect. */
    private readonly filePath: string | (() => string),
    /** @deprecated Ignored — AH requires Title:/Artist:/Album: lines. Kept for config compat. */
    _format?: string,
  ) {}

  resolvedPath(): string {
    const raw = typeof this.filePath === "function" ? this.filePath() : this.filePath
    return resolveNowPlayingPath(raw)
  }

  writeFile(meta: { title?: string; artist?: string; album?: string }): void {
    const title = (meta.title ?? "").trim()
    // Don't wipe AH metadata with an empty title (e.g. notify with blank fields)
    if (!title) {
      console.warn("[now-playing] skip write: empty title")
      return
    }

    const content = formatAudioHijackNowPlaying({
      title,
      artist: (meta.artist ?? "").trim(),
      album: (meta.album ?? "").trim(),
    })
    const filePath = this.resolvedPath()
    if (content === this.lastContent && filePath === this.lastPath) return
    const dir = dirname(filePath)
    try {
      if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(filePath, content, "utf8")
      this.lastContent = content
      this.lastPath = filePath
      console.log(`[now-playing] wrote ${filePath}`)
    } catch (e) {
      console.error(`[now-playing] failed to write ${filePath}:`, e)
    }
  }

  async publish(roomId: string, meta: NowPlayingMeta): Promise<void> {
    this.writeFile(meta)
    await this.post(roomId, meta)
  }
}

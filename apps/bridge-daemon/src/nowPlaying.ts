import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname } from "node:path"
import type { RedisClientType } from "redis"

type RedisLike = RedisClientType<any, any, any>

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

export class NowPlayingPublisher {
  private lastContent = ""

  constructor(
    private readonly redis: RedisLike,
    private readonly filePath: string,
    /** @deprecated Ignored — AH requires Title:/Artist:/Album: lines. Kept for config compat. */
    _format?: string,
  ) {}

  writeFile(meta: { title?: string; artist?: string; album?: string }): void {
    const title = (meta.title ?? "").trim()
    // Don't wipe AH metadata with an empty title (e.g. notify with blank fields)
    if (!title) return

    const content = formatAudioHijackNowPlaying({
      title,
      artist: (meta.artist ?? "").trim(),
      album: (meta.album ?? "").trim(),
    })
    if (content === this.lastContent) return
    this.lastContent = content
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, content, "utf8")
  }

  async publish(roomId: string, meta: NowPlayingMeta): Promise<void> {
    this.writeFile(meta)
    await this.redis.publish(
      "SYSTEM:NOW_PLAYING_CHANGED",
      JSON.stringify({
        roomId,
        title: meta.title ?? "",
        artist: meta.artist ?? "",
        album: meta.album ?? "",
        mediaSource: meta.mediaSource,
      }),
    )
  }
}

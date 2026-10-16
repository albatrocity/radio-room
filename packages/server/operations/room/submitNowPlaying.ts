import type { JobApi } from "@repo/types"

export type NowPlayingFields = {
  title?: string | null
  artist?: string | null
  album?: string | null
}

/**
 * Now-playing submission shared by device HTTP and the Redis fallback subscriber.
 * Empty title clears. Otherwise the track id is the artist-title-album join and
 * `sourceType` is `rtmp` (ADR 0204).
 */
export async function submitNowPlaying(
  api: Pick<JobApi, "submitMediaData">,
  roomId: string,
  fields: NowPlayingFields,
): Promise<void> {
  const title = typeof fields.title === "string" ? fields.title : ""
  if (!title) {
    await api.submitMediaData({ roomId })
    return
  }

  const artist = typeof fields.artist === "string" ? fields.artist : undefined
  const album = typeof fields.album === "string" ? fields.album : undefined
  const trackId = [artist, title, album].filter(Boolean).join("-")
  await api.submitMediaData({
    roomId,
    submission: {
      trackId,
      sourceType: "rtmp",
      title,
      artist,
      album,
    },
  })
}

import type { MetadataSourceTrack, MetadataSourceUrl } from "@repo/types/MetadataSource"
import type { QueueItem } from "@repo/types/Queue"

const METADATA_SOURCE_ORDER = ["spotify", "tidal", "applemusic"] as const

function pickImageUrl(images: MetadataSourceUrl[] | undefined): string | null {
  if (!images?.length) return null
  const preferred = images.find((i) => i.type === "image")
  return (preferred ?? images[0])?.url ?? null
}

/** Best-effort cover art from primary track, album, or enriched metadata sources. */
export function queueItemCoverUrl(item: QueueItem): string | null {
  let url = pickImageUrl(item.track?.images)
  if (url) return url
  url = pickImageUrl(item.track?.album?.images)
  if (url) return url

  const sources = item.metadataSources
  if (!sources) return null
  for (const key of METADATA_SOURCE_ORDER) {
    const bundle = sources[key]
    const t = bundle?.track
    if (!t) continue
    url = pickImageUrl(t.images) ?? pickImageUrl(t.album?.images)
    if (url) return url
  }
  return null
}

function formatArtistNames(track: MetadataSourceTrack | undefined): string | null {
  const artists = track?.artists
  if (!artists?.length) return null
  const parts = artists.map((a) => a.title?.trim()).filter(Boolean) as string[]
  return parts.length ? parts.join(", ") : null
}

function trackFromMetadataSources(item: QueueItem): MetadataSourceTrack | undefined {
  const sources = item.metadataSources
  if (!sources) return undefined
  for (const key of METADATA_SOURCE_ORDER) {
    const t = sources[key]?.track
    if (t) return t
  }
  return undefined
}

/** Comma-separated primary artist names when present. */
export function queueItemArtistLine(item: QueueItem): string | null {
  const primary = formatArtistNames(item.track)
  if (primary) return primary
  return formatArtistNames(trackFromMetadataSources(item))
}

/** Album title when present. */
export function queueItemAlbumLine(item: QueueItem): string | null {
  if (item.track?.album?.title?.trim()) {
    return item.track.album.title.trim()
  }
  const meta = trackFromMetadataSources(item)
  const t = meta?.album?.title?.trim()
  return t || null
}

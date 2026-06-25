import type { MetadataSourceTrack, MetadataSourceUrl } from "@repo/types/MetadataSource"

function pickImageUrl(images: MetadataSourceUrl[] | undefined): string | null {
  if (!images?.length) return null
  const preferred = images.find((i) => i.type === "image")
  return (preferred ?? images[0])?.url ?? null
}

export function metadataTrackCoverUrl(track: MetadataSourceTrack): string | null {
  return pickImageUrl(track.images) ?? pickImageUrl(track.album?.images)
}

export function metadataTrackArtistLine(track: MetadataSourceTrack): string | null {
  const parts = track.artists?.map((a) => a.title?.trim()).filter(Boolean) as string[]
  return parts.length ? parts.join(", ") : null
}

export function metadataTrackAlbumLine(track: MetadataSourceTrack): string | null {
  const t = track.album?.title?.trim()
  return t || null
}

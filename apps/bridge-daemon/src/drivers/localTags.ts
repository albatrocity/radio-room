import type { MetadataSourceTrack } from "@repo/types"
import type { NavidromeSong } from "./localTypes"

export function emptyAlbum(images: MetadataSourceTrack["images"] = []): MetadataSourceTrack["album"] {
  return {
    id: "",
    title: "",
    urls: [],
    artists: [],
    releaseDate: "",
    releaseDatePrecision: "year",
    totalTracks: 0,
    label: "",
    images,
  }
}

/** Basename without extension — used when tags have no title. */
export function titleFromFilename(path: string | undefined | null): string | undefined {
  if (!path?.trim()) return undefined
  const base = path.split(/[/\\]/).filter(Boolean).pop()
  if (!base) return undefined
  const withoutExt = base.replace(/\.[^./\\]+$/, "")
  const title = (withoutExt || base).trim()
  return title || undefined
}

export function isPlaceholderTitle(title: string | undefined | null, trackId?: string): boolean {
  const t = (title ?? "").trim()
  if (!t) return true
  if (t.toLowerCase() === "unknown") return true
  if (trackId && t === trackId) return true
  return false
}

export function isPlaceholderArtist(artist: string | undefined | null): boolean {
  const a = (artist ?? "").trim()
  if (!a) return true
  if (a.toLowerCase() === "unknown" || a.toLowerCase() === "local") return true
  return false
}

export function resolveLocalDisplayTitle(song: NavidromeSong): string {
  const id = song.id != null ? String(song.id) : undefined
  if (!isPlaceholderTitle(song.title, id)) return String(song.title).trim()
  return titleFromFilename(song.path) ?? (song.title?.trim() || id || "Unknown")
}

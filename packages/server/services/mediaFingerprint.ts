/**
 * Content-addressing for S3 media keys (ADR 0186).
 * Pure — no Redis, no S3, no AppContext.
 */
import { createHash } from "node:crypto"
import type { MetadataSourceTrack } from "@repo/types"

export const MEDIA_KEY_VERSION = "v1"

/** Lowercase, strip punctuation, collapse whitespace. Deterministic. */
export function normalizeMediaToken(value: string | undefined | null): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

/**
 * Stable identity for a track, independent of the Navidrome DB.
 * Returns null when there is not enough signal — caller falls back to id-keyed pointer.
 */
export function fingerprintTrack(track: MetadataSourceTrack): string | null {
  const artist = normalizeMediaToken(track.artists?.[0]?.title)
  const album = normalizeMediaToken(track.album?.title)
  const title = normalizeMediaToken(track.title)
  if (!title) return null
  if (!artist && !album) return null
  // MetadataSourceTrack.duration is milliseconds
  const durationSec = Math.round((track.duration ?? 0) / 1000)
  return sha256(
    [artist, album, title, track.discNumber ?? 0, track.trackNumber ?? 0, durationSec].join("|"),
  )
}

/** Full sha256 of cover / image bytes (not truncated md5). */
export function hashCoverBytes(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "base64") : input
  return sha256(buf)
}

/** Identity for cover pointers — playlist name or artist|album (rescan-stable). */
export function coverIdentityHash(params: {
  kind: "playlist" | "album"
  playlistName?: string
  artist?: string
  album?: string
}): string {
  if (params.kind === "playlist") {
    return sha256(normalizeMediaToken(params.playlistName))
  }
  return sha256(
    [normalizeMediaToken(params.artist), normalizeMediaToken(params.album)].join("|"),
  )
}

export function previewObjectKey(fingerprintHash: string): string {
  return `media/previews/${MEDIA_KEY_VERSION}/${fingerprintHash}.mp3`
}

export function coverObjectKey(contentHash: string, variant: "sm" | "lg"): string {
  return `media/covers/${MEDIA_KEY_VERSION}/${contentHash}/${variant}.jpg`
}

export function roomImageObjectKey(roomId: string, contentHash: string, ext = "jpg"): string {
  return `media/rooms/${roomId}/images/${MEDIA_KEY_VERSION}/${contentHash}.${ext}`
}

export function previewPointerKey(fingerprintHash: string): string {
  return `media:ptr:${MEDIA_KEY_VERSION}:preview:${fingerprintHash}`
}

export function coverPointerKey(
  libraryId: string,
  identityHash: string,
  variant: "sm" | "lg",
): string {
  return `media:ptr:${MEDIA_KEY_VERSION}:cover:${libraryId}:${identityHash}:${variant}`
}

export function idFallbackPreviewPointerKey(libraryId: string, trackId: string): string {
  return `media:ptr:${MEDIA_KEY_VERSION}:preview-id:${libraryId}:${trackId}`
}

import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { orderTags, parseFile, type IAudioMetadata } from "music-metadata"
import {
  isValidPublicHttpUrl,
  type PublicUrlCandidates,
  type PublicUrlTagToken,
} from "./publicUrlTagPriority"

export {
  DEFAULT_PUBLIC_URL_TAG_PRIORITY,
  isValidPublicHttpUrl,
  pickPublicUrl,
  PUBLIC_URL_TAG_TOKENS,
  type PublicUrlCandidates,
  type PublicUrlTagToken,
} from "./publicUrlTagPriority"

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim()
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.trim()) return item.trim()
      }
    }
  }
  return undefined
}

function extractUrlValue(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw.trim() || undefined
  if (raw && typeof raw === "object") {
    const obj = raw as { url?: unknown; text?: unknown }
    if (typeof obj.url === "string" && obj.url.trim()) return obj.url.trim()
    if (typeof obj.text === "string" && obj.text.trim()) return obj.text.trim()
  }
  return undefined
}

function setCandidate(out: PublicUrlCandidates, token: PublicUrlTagToken, value: string | undefined) {
  if (!value || out[token]) return
  if (isValidPublicHttpUrl(value)) out[token] = value.trim()
}

function collectFromNative(metadata: IAudioMetadata, out: PublicUrlCandidates) {
  for (const tags of Object.values(metadata.native ?? {})) {
    if (!Array.isArray(tags)) continue
    const ordered = orderTags(tags)
    for (const [id, values] of Object.entries(ordered)) {
      const key = id.toUpperCase()
      const list = Array.isArray(values) ? values : [values]
      for (const raw of list) {
        const url = extractUrlValue(raw)
        if (!url) continue
        if (key === "WCOM") setCandidate(out, "wcom", url)
        else if (key === "WPAY") setCandidate(out, "wpay", url)
        else if (key === "WOAF") setCandidate(out, "woaf", url)
        else if (key === "WOAS") setCandidate(out, "woas", url)
        else if (key === "WOAR" || key === "WAR") setCandidate(out, "woar", url)
        else if (key === "WXXX") setCandidate(out, "wxxx", url)
        else if (key === "PURCHASEURL") setCandidate(out, "purchaseurl", url)
        else if (key === "BANDCAMP") setCandidate(out, "bandcamp", url)
        else if (key === "URL") setCandidate(out, "url", url)
        else if (key === "WEBSITE" || key === "WEBLINK") setCandidate(out, "website", url)
      }
    }
  }
}

function collectFromCommon(metadata: IAudioMetadata, out: PublicUrlCandidates) {
  const website = firstString(metadata.common?.website)
  setCandidate(out, "website", website)
  setCandidate(out, "woar", website)

  const comment = firstString(
    ...(Array.isArray(metadata.common?.comment)
      ? metadata.common.comment.map((c) => (typeof c === "string" ? c : (c as { text?: string })?.text))
      : [metadata.common?.comment]),
  )
  if (comment && isValidPublicHttpUrl(comment)) {
    setCandidate(out, "comment", comment)
  }
}

export function collectPublicUrlCandidates(params: {
  metadata?: IAudioMetadata | null
  comment?: string | null
  musicBrainzId?: string | null
}): PublicUrlCandidates {
  const out: PublicUrlCandidates = {}
  if (params.metadata) {
    collectFromNative(params.metadata, out)
    collectFromCommon(params.metadata, out)
  }

  const apiComment = params.comment?.trim()
  if (apiComment && isValidPublicHttpUrl(apiComment)) {
    setCandidate(out, "comment", apiComment)
  }

  const mbid = params.musicBrainzId?.trim()
  if (mbid && /^[0-9a-f-]{36}$/i.test(mbid)) {
    setCandidate(out, "musicbrainz", `https://musicbrainz.org/recording/${mbid}`)
  }

  return out
}

export function resolveSongFilePath(
  musicFolder: string | undefined,
  relativePath: string | undefined | null,
): string | null {
  if (!relativePath?.trim()) return null
  const path = relativePath.trim()
  if (isAbsolute(path) && existsSync(path)) return path
  if (!musicFolder?.trim()) return null
  const abs = join(musicFolder.trim(), path)
  return existsSync(abs) ? abs : null
}

export async function readPublicUrlCandidatesFromFile(
  filePath: string,
): Promise<PublicUrlCandidates> {
  try {
    const metadata = await parseFile(filePath, { skipCovers: true })
    return collectPublicUrlCandidates({ metadata })
  } catch {
    return {}
  }
}

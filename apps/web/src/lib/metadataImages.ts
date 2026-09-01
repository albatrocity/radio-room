import type { MetadataSourceUrl } from "@repo/types"

/** Adapters encode image dimensions in `id` as `WxH` (e.g. Spotify `640x640`). */
function pixelArea(image: MetadataSourceUrl): number {
  const [width, height] = image.id.split("x")
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return 0
  return w * h
}

export function firstImageUrl(images?: MetadataSourceUrl[]): string | undefined {
  return images?.find((img) => img.type === "image")?.url
}

const FEATURE_TARGET_AREA = 320 * 320

/**
 * Cover sized for now-playing / lock-screen: closest to ~320px, not always the
 * first (often tiny) or largest (often 640+). Falls back to first if ids lack WxH.
 */
export function featureImageUrl(images?: MetadataSourceUrl[]): string | undefined {
  const candidates = images?.filter((img) => img.type === "image" && img.url) ?? []
  if (candidates.length === 0) return undefined
  const sized = candidates.filter((img) => pixelArea(img) > 0)
  if (sized.length === 0) return candidates[0]?.url
  let best = sized[0]!
  let bestDelta = Math.abs(pixelArea(best) - FEATURE_TARGET_AREA)
  for (const candidate of sized) {
    const delta = Math.abs(pixelArea(candidate) - FEATURE_TARGET_AREA)
    if (delta < bestDelta) {
      best = candidate
      bestDelta = delta
    }
  }
  return best.url
}

/** WebKit scores candidates against a 512x512 ideal; match it so we agree. */
const LOCK_SCREEN_TARGET_EDGE = 512

/**
 * Lock-screen artwork, ordered closest-to-512 first.
 *
 * Declares each image's real dimensions rather than a guessed size, and falls
 * back to room artwork so stations whose tracks the metadata sources cannot
 * match still show a cover instead of a grey box. Order matters because older
 * WebKit reads only the first entry, so the best candidate has to lead.
 */
export function mediaSessionArtwork(
  images?: MetadataSourceUrl[],
  fallbackUrl?: string,
): MediaImage[] {
  const entries = (images ?? [])
    .filter((img) => img.type === "image" && img.url)
    .map((img) => {
      const sized = /^\d+x\d+$/.test(img.id)
      const edge = sized ? Math.max(...img.id.split("x").map(Number)) : 0
      return {
        image: sized ? { src: img.url, sizes: img.id } : { src: img.url },
        // Unsized images sort last: WebKit has to download them to rank them.
        distance: sized ? Math.abs(edge - LOCK_SCREEN_TARGET_EDGE) : Infinity,
      }
    })
    .sort((a, b) => a.distance - b.distance)
    .map((entry) => entry.image)
  if (entries.length > 0) return entries
  return fallbackUrl ? [{ src: fallbackUrl }] : []
}

/** Biggest cover available, for full-size preview. Falls back to the first. */
export function largestImageUrl(images?: MetadataSourceUrl[]): string | undefined {
  const candidates = images?.filter((img) => img.type === "image" && img.url) ?? []
  if (candidates.length === 0) return undefined
  let best = candidates[0]!
  for (const candidate of candidates) {
    if (pixelArea(candidate) > pixelArea(best)) {
      best = candidate
    }
  }
  return best.url
}

function isBrowserRenderableImageUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  // data: and https: work for remote listeners. LAN Navidrome URLs (http://127.0.0.1)
  // do not — prefer track data URIs over album LAN stubs from older bridge packs.
  if (trimmed.startsWith("data:")) return true
  if (trimmed.startsWith("https://")) return true
  if (trimmed.startsWith("http://")) {
    try {
      const host = new URL(trimmed).hostname
      return host !== "127.0.0.1" && host !== "localhost" && host !== "::1"
    } catch {
      return false
    }
  }
  return false
}

/**
 * Prefer image lists the browser can load. Local CatalogBrowse used to ship
 * Navidrome LAN cover URLs; queue/track rows already use data URIs.
 */
export function preferBrowserRenderableImages(
  primary?: MetadataSourceUrl[],
  fallback?: MetadataSourceUrl[],
): MetadataSourceUrl[] | undefined {
  const primaryOk = primary?.some((img) => img.type === "image" && isBrowserRenderableImageUrl(img.url))
  if (primaryOk) return primary
  const fallbackOk = fallback?.some(
    (img) => img.type === "image" && isBrowserRenderableImageUrl(img.url),
  )
  if (fallbackOk) return fallback
  return primary?.length ? primary : fallback
}

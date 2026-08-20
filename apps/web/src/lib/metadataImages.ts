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

/**
 * Resolve a track-preview clip URL for Howl (html5 Audio).
 *
 * - Absolute URLs (CDN media from ADR 0186, or a full API URL) pass through.
 * - Relative `/api/rooms/.../track-previews/...` paths stay same-origin in
 *   dev (Vite proxies) and get `VITE_API_URL` in production.
 */
export function resolvePreviewClipUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  // Absolute CDN / API URLs must not be re-hosted onto VITE_API_URL — that
  // turned `https://cdn…/media/previews/…` into `https://api…/media/previews/…`
  // (404) after the S3 cutover.
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  if (import.meta.env.DEV) return path

  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
  return base ? `${base}${path}` : path
}

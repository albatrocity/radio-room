/**
 * Resolve a track-preview clip URL for Howl (html5 Audio).
 * In dev, use same-origin relative paths (Vite proxies /api/rooms → API).
 * In production, prefix VITE_API_URL when the API is on another host.
 */
export function resolvePreviewClipUrl(url: string): string {
  let path = url.trim()
  if (/^https?:\/\//i.test(path)) {
    try {
      const u = new URL(path)
      path = u.pathname + u.search
    } catch {
      return url
    }
  }
  if (!path.startsWith("/")) path = `/${path}`

  if (import.meta.env.DEV) return path

  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
  return base ? `${base}${path}` : path
}

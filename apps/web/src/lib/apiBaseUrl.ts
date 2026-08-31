import { resolveBrowserApiBaseUrl } from "@repo/utils"

/**
 * Browser API origin from `VITE_API_URL`.
 * LAN / mDNS hosts (e.g. ross.local:8000 on a phone) use the same hostname on :3000.
 */
export function getApiBaseUrl(): string {
  return resolveBrowserApiBaseUrl(
    String(import.meta.env.VITE_API_URL ?? ""),
    typeof window === "undefined" ? null : window.location,
  )
}

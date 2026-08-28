/**
 * Browser API origin. Loopback keeps VITE_API_URL (127.0.0.1).
 * LAN / mDNS hosts (e.g. ross.local:8000 on a phone) use the same hostname on :3000.
 */
export function getApiBaseUrl(): string {
  const configured = String(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
  if (typeof window === "undefined") return configured
  const { hostname, protocol } = window.location
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return configured
  }
  return `${protocol}//${hostname}:3000`
}

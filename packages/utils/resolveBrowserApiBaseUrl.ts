/**
 * Browser API origin from `VITE_API_URL`, with a LAN-only rewrite.
 *
 * Loopback and public hosts (production Netlify, etc.) keep the configured URL.
 * mDNS (`.local`) and private IPs use the same hostname on port 3000 so a phone
 * on the LAN can reach the API without baking `127.0.0.1` into the bundle.
 */

export type BrowserLocationLike = {
  hostname: string
  protocol: string
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

function isPrivateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!match) return false
  const octets = match.slice(1).map(Number)
  if (octets.some((n) => n > 255)) return false
  const [a, b] = octets
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

/** Link-local (fe80::/10) or unique local (fc00::/7). Hostname must contain `:`. */
function isPrivateIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (host.startsWith("fe80:")) return true
  if (host.startsWith("fc") || host.startsWith("fd")) return true
  return false
}

export function isLanApiHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host.endsWith(".local")) return true
  if (isPrivateIpv4(host)) return true
  if (isPrivateIpv6(host)) return true
  return false
}

export function resolveBrowserApiBaseUrl(
  configured: string,
  location?: BrowserLocationLike | null,
): string {
  const base = configured.replace(/\/$/, "")
  if (!location) return base
  const { hostname, protocol } = location
  if (LOOPBACK_HOSTS.has(hostname)) return base
  if (isLanApiHostname(hostname)) return `${protocol}//${hostname}:3000`
  return base
}

import type { IncomingMessage } from "node:http"

/**
 * Header the studio's own `fetch` calls send. A custom header makes any
 * cross-origin request preflight, and Vite's dev CORS won't approve a foreign
 * origin, so another site can't fire a "simple" POST at these endpoints.
 */
export const STUDIO_REQUEST_HEADER = "x-studio-request"

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"])

export type StudioRequestRejection = { status: number; message: string }

/**
 * Guard for dev middleware that acts with the designer's credentials or
 * writes files (ADR 0205). The dev server listens on 0.0.0.0, so:
 * - only this machine may call (loopback socket);
 * - the request must carry `X-Studio-Request: 1` (blocks cross-site simple POSTs);
 * - `Host` must be a local name, and `Origin` (when sent) must match it, so a
 *   DNS-rebinding page under another hostname is refused too.
 *
 * @returns null when the request may proceed.
 */
export function rejectStudioRequest(req: IncomingMessage): StudioRequestRejection | null {
  if (!LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? "")) {
    return { status: 403, message: "This studio endpoint only answers requests from this machine." }
  }
  if (req.headers[STUDIO_REQUEST_HEADER] !== "1") {
    return { status: 403, message: "Missing X-Studio-Request header." }
  }
  const host = req.headers.host ?? ""
  if (!LOCAL_HOSTNAMES.has(hostnameOf(host))) {
    return { status: 403, message: "Open Game Studio at localhost to use this endpoint." }
  }
  const origin = req.headers.origin
  if (origin !== undefined) {
    let originHost: string | null = null
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = null
    }
    if (originHost !== host) {
      return { status: 403, message: "Cross-origin requests aren't allowed." }
    }
  }
  return null
}

/** `localhost:8005` → `localhost`; `[::1]:8005` → `[::1]`. */
function hostnameOf(host: string): string {
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1)
  return host.split(":")[0] ?? ""
}

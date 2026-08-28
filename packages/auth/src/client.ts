import { createAuthClient } from "better-auth/react"
import { adminClient } from "better-auth/client/plugins"
import { inviteOnlyClient } from "better-auth-invitation-only/client"

const INVITE_COOKIE_NAME = "ba-invite-code"

/**
 * Store invite code in a cookie so it is sent when Google redirects back to the API
 * (e.g. `api.*`). The plugin's `setInviteCodeCookie` is host-only, so it never reaches
 * another subdomain — set `VITE_AUTH_COOKIE_DOMAIN` in production (e.g. `.listeningroom.club`).
 */
export function setInviteCodeCookieForOAuth(
  code: string,
  maxAgeSeconds: number = 300,
  cookieName: string = INVITE_COOKIE_NAME,
): void {
  if (typeof document === "undefined") return
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""
  const d = (import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string | undefined)?.trim()
  const domain =
    d && d.length > 0 ? `; Domain=${d.startsWith(".") ? d : `.${d}`}` : ""
  document.cookie = `${cookieName}=${encodeURIComponent(code)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}${domain}`
}

/** Clear invite cookie; pass the same domain strategy as {@link setInviteCodeCookieForOAuth}. */
export function clearInviteCodeCookieForOAuth(cookieName: string = INVITE_COOKIE_NAME): void {
  if (typeof document === "undefined") return
  const d = (import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string | undefined)?.trim()
  const domain =
    d && d.length > 0 ? `; Domain=${d.startsWith(".") ? d : `.${d}`}` : ""
  document.cookie = `${cookieName}=; path=/; max-age=0; SameSite=Lax${domain}`
}

/** Use for raw fetch() to Better-Auth routes; matches authClient base + /api/auth (Vite proxy when VITE_API_URL is unset). */
export function authApiUrl(path: string): string {
  const configured = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
  const base =
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1" &&
    window.location.hostname !== "[::1]"
      ? `${window.location.protocol}//${window.location.hostname}:3000`
      : configured
  const prefix = base ? `${base}/api/auth` : "/api/auth"
  const p = path.startsWith("/") ? path : `/${path}`
  return `${prefix}${p}`
}

function authClientBaseURL(): string {
  const configured = import.meta.env.VITE_API_URL || ""
  if (typeof window === "undefined") return configured
  const { hostname, protocol } = window.location
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return configured
  }
  return `${protocol}//${hostname}:3000`
}

export const authClient = createAuthClient({
  baseURL: authClientBaseURL(),
  plugins: [adminClient(), inviteOnlyClient()],
  fetchOptions: {
    credentials: "include" as RequestCredentials,
  },
})

export const { useSession, signIn, signUp, signOut } = authClient

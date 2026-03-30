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
  const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
  const prefix = base ? `${base}/api/auth` : "/api/auth"
  const p = path.startsWith("/") ? path : `/${path}`
  return `${prefix}${p}`
}

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || "",
  plugins: [adminClient(), inviteOnlyClient()],
  fetchOptions: {
    credentials: "include" as RequestCredentials,
  },
})

export const { useSession, signIn, signUp, signOut } = authClient

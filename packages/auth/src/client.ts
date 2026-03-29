import { createAuthClient } from "better-auth/react"
import { adminClient } from "better-auth/client/plugins"
import { inviteOnlyClient } from "better-auth-invitation-only/client"

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

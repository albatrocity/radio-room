import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { toNodeHandler } from "better-auth/node"
import { inviteOnly } from "better-auth-invitation-only"
import { eq } from "drizzle-orm"
import { db, user as userTable } from "@repo/db"
import { oauthSignupInviteAfterHook, oauthSignupInviteBeforeHook } from "./oauthSignupInviteHooks"

function trimOrigin(url: string): string {
  return url.replace(/\/$/, "")
}

/**
 * Origin Google (and other IdPs) redirect to for `/api/auth/callback/*`.
 * Must be the host that runs the API (Better Auth handler), not only the static web host.
 * Local dev: `APP_URL` (Vite proxies `/api/auth` to the API).
 * Production with API on e.g. `api.*`: set `API_URL` on the API process and `ENVIRONMENT=production`,
 * or override with `BETTER_AUTH_BASE_URL`.
 */
function betterAuthBaseURL(): string {
  if (process.env.BETTER_AUTH_BASE_URL) {
    return trimOrigin(process.env.BETTER_AUTH_BASE_URL)
  }
  if (process.env.ENVIRONMENT === "production" && process.env.API_URL) {
    return trimOrigin(process.env.API_URL)
  }
  return trimOrigin(process.env.APP_URL || "http://127.0.0.1:8000")
}

const authBaseURL = betterAuthBaseURL()

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  baseURL: authBaseURL,
  basePath: "/api/auth",
  hooks: {
    before: oauthSignupInviteBeforeHook(),
    after: oauthSignupInviteAfterHook(),
  },
  trustedOrigins: [
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8001",
    ...(process.env.APP_URL ? [trimOrigin(process.env.APP_URL)] : []),
    ...(process.env.API_URL ? [trimOrigin(process.env.API_URL)] : []),
    ...(process.env.SCHEDULER_URL ? [trimOrigin(process.env.SCHEDULER_URL)] : []),
  ],
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account",
      /** Only `/register` sends `requestSignUp: true`; `/login` cannot create new users via Google. */
      disableImplicitSignUp: true,
      overrideUserInfoOnSignIn: true,
    },
  },
  plugins: [
    admin(),
    inviteOnly({
      enabled: () => process.env.SEED_MODE !== "true",
      baseUrl: process.env.APP_URL || "http://127.0.0.1:8000",
      /** OAuth invite checks run in `oauthSignupInviteBeforeHook`; keep email signup gated here. */
      protectedPaths: {
        oauthCallbacks: false,
      },
      expiresInSeconds: 7 * 24 * 60 * 60,
      onInvitationUsed: async ({ user }) => {
        await db
          .update(userTable)
          .set({ role: "admin", updatedAt: new Date() })
          .where(eq(userTable.id, user.id))
      },
    }),
  ],
})

export type Auth = typeof auth

export const authHandler = toNodeHandler(auth)

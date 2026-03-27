import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { toNodeHandler } from "better-auth/node"
import { inviteOnly } from "better-auth-invitation-only"
import { db } from "@repo/db"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  baseURL: process.env.APP_URL || "http://localhost:8000",
  basePath: "/api/auth",
  trustedOrigins: [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
  ],
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account",
    },
  },
  plugins: [
    admin(),
    inviteOnly({
      enabled: () => process.env.SEED_MODE !== "true",
      baseUrl: process.env.APP_URL || "http://localhost:8000",
      expiresInSeconds: 7 * 24 * 60 * 60,
      onInvitationUsed: async () => {
        // Invitation consumed; admin must manually promote user role if needed
      },
    }),
  ],
})

export type Auth = typeof auth

export const authHandler = toNodeHandler(auth)

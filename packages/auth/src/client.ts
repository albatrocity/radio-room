import { createAuthClient } from "better-auth/react"
import { adminClient } from "better-auth/client/plugins"
import { inviteOnlyClient } from "better-auth-invitation-only/client"

export const authClient = createAuthClient({
  baseURL: "",
  plugins: [adminClient(), inviteOnlyClient()],
})

export const { useSession, signIn, signUp, signOut } = authClient

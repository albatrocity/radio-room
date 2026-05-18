import type { UserPersona } from "@repo/types"

export interface User {
  userId: string
  username?: string
  isAdmin?: boolean
  isDj?: boolean
  isDeputyDj?: boolean
  status?: "participating" | "listening"
  personas?: UserPersona[]
}

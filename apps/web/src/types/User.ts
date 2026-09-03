import type { UserPersona } from "@repo/types"

export interface User {
  userId: string
  username?: string
  /** Presented-identity icon on baked chat attribution (ADR 0150). */
  usernameIcon?: string
  isAdmin?: boolean
  isDj?: boolean
  isDeputyDj?: boolean
  status?: "participating" | "listening"
  personas?: UserPersona[]
}

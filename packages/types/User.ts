import { z } from "zod"

// =============================================================================
// User Schema & Type
// =============================================================================

export const userSchema = z.object({
  id: z.string().optional(), // socket ID
  userId: z.string(),
  /** ISO timestamp from Redis user hash (set at login); optional on typed views */
  connectedAt: z.string().optional(),
  username: z.string().optional(),
  isAdmin: z.boolean().optional(),
  isDj: z.boolean().optional(),
  isDeputyDj: z.boolean().optional(),
  status: z.enum(["participating", "listening"]).optional(),
})

export type User = z.infer<typeof userSchema>

// =============================================================================
// StoredUser (Redis storage format - booleans as strings)
// =============================================================================

type Bool = "true" | "false"

export interface StoredUser extends Omit<User, "isDj" | "isAdmin" | "isDeputyDj"> {
  isDj: Bool
  isDeputyDj: Bool
  isAdmin: Bool
}

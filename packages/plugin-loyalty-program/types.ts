import { z } from "zod"

export const loyaltyProgramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(1).max(24 * 60).default(5),
  baseCoins: z.number().int().min(0).default(1),
  /** Added to base for each prior payout in the current game session (0 = fixed reward). */
  scaleBonusPerInterval: z.number().int().min(0).default(0),
  /** Minimum minutes in room before eligibility lines up with first scheduled payout. */
  minSessionMinutes: z.number().int().min(0).default(0),
  messageTemplate: z
    .string()
    .default(
      "Loyalty reward: {{coins}} coins for {{sessionMs:duration}} in the room (every {{intervalMinutes}} min).",
    ),
})

export type LoyaltyProgramConfig = z.infer<typeof loyaltyProgramConfigSchema>

export const defaultLoyaltyProgramConfig: LoyaltyProgramConfig = {
  enabled: false,
  intervalMinutes: 5,
  baseCoins: 1,
  scaleBonusPerInterval: 0,
  minSessionMinutes: 0,
  messageTemplate:
    "Loyalty reward: {{coins}} coins for {{sessionMs:duration}} in the room (every {{intervalMinutes}} min).",
}

/** JSON persisted per user in plugin sandbox storage */
export interface LoyaltySessionRecord {
  sessionAnchorMs: number
  intervalsPaid: number
  nextAwardDueMs: number
  gameSessionId: string
}

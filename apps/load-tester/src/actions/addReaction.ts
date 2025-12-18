import type { SimulatedUser } from "../SimulatedUser.js"
import { pickRandom } from "../utils/random.js"

export interface AddReactionOptions {
  targetTypes: Array<"message" | "track">
  emojis?: string[]
}

export function createAddReactionAction(options: AddReactionOptions) {
  return async (user: SimulatedUser): Promise<void> => {
    const targetType = pickRandom(options.targetTypes)
    const emoji = options.emojis ? pickRandom(options.emojis) : undefined
    await user.addReaction(targetType, emoji)
  }
}


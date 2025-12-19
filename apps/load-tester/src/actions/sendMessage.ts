import type { SimulatedUser } from "../SimulatedUser.js"
import { randomMessage, randomDelay, sleep } from "../utils/random.js"

export interface SendMessageOptions {
  content?: string[]
  simulateTyping?: boolean
}

export function createSendMessageAction(options: SendMessageOptions = {}) {
  return async (user: SimulatedUser): Promise<void> => {
    const message = randomMessage(options.content)

    // Optionally simulate typing
    if (options.simulateTyping) {
      await user.startTyping()
      await sleep(randomDelay(500, 2000))
      await user.stopTyping()
    }

    await user.sendMessage(message)
  }
}


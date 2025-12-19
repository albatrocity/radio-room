import type { SimulatedUser } from "../SimulatedUser.js"
import { pickRandom } from "../utils/random.js"

export interface QueueSongOptions {
  trackIds: string[]
}

export function createQueueSongAction(options: QueueSongOptions) {
  return async (user: SimulatedUser): Promise<void> => {
    const trackId = pickRandom(options.trackIds)
    await user.queueSong(trackId)
  }
}


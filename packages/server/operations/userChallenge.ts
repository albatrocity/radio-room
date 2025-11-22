import { FIVE_MINUTES } from "../lib/constants"
import { AppContext } from "@repo/types"

export async function checkUserChallenge({
  challenge,
  userId,
  context,
}: {
  challenge: string
  userId: string
  context: AppContext
}) {
  try {
    const solution = await context.redis.pubClient.get(`challenge:${userId}`)
    if (solution && solution !== challenge) {
      throw new Error("Unauthorized: invalid challenge")
    }
  } catch (e) {
    throw new Error("Unauthorized: invalid challenge")
  }
}

export async function storeUserChallenge(
  {
    userId,
    challenge,
  }: {
    userId: string
    challenge: string
  },
  context: AppContext,
) {
  await context.redis.pubClient.set(`challenge:${userId}`, challenge, {
    PX: FIVE_MINUTES,
  })
}

export async function clearUserChallenge(userId: string, context: AppContext) {
  await context.redis.pubClient.unlink(`challenge:${userId}`)
}

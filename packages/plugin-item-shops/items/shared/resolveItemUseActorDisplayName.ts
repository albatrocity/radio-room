import { hasAnonymousActions } from "@repo/plugin-base/helpers"
import type { ItemShopsBehaviorDeps } from "./types"

const ANONYMOUS_PUBLIC_LABEL = "Someone"

/** Label for room-visible system messages; uses `anonymous_actions` when that flag is active. */
export async function resolveItemUseActorDisplayName(
  deps: ItemShopsBehaviorDeps,
  userId: string,
): Promise<string> {
  const state = await deps.game.getUserState(userId)
  if (state && hasAnonymousActions(state.modifiers, Date.now())) {
    return ANONYMOUS_PUBLIC_LABEL
  }
  const [user] = await deps.context.api.getUsersByIds([userId])
  return user?.username?.trim() || userId
}

import {
  PRESENTED_IDENTITY_ANONYMOUS_LABEL,
  hasAnonymousActions,
  resolvePresentedIdentity,
} from "@repo/plugin-base/helpers"
import type { ItemShopsBehaviorDeps } from "./types"

/** Alias of the canonical label in `@repo/game-logic` (ADR 0149 / 0150). */
export const ANONYMOUS_PUBLIC_LABEL = PRESENTED_IDENTITY_ANONYMOUS_LABEL

export type ItemUseActorDisplayName = {
  label: string
  userId: string
  anonymous: boolean
}

/**
 * Label for room-visible system messages.
 * Prefers core presented-identity grant (ADR 0150); falls back to `anonymous_actions`.
 */
export async function resolveItemUseActorDisplayName(
  deps: ItemShopsBehaviorDeps,
  userId: string,
): Promise<ItemUseActorDisplayName> {
  // Independent reads — issue them together rather than in series.
  const [grant, [user]] = await Promise.all([
    deps.game.getPresentedIdentity(userId),
    deps.context.api.getUsersByIds([userId]),
  ])
  const trueUsername = user?.username?.trim() || userId

  if (grant) {
    const resolved = resolvePresentedIdentity({
      userId,
      trueUsername,
      grant,
    })
    return {
      label: resolved.label,
      userId,
      anonymous: resolved.masked,
    }
  }

  const state = await deps.game.getUserState(userId)
  if (state && hasAnonymousActions(state.modifiers, Date.now())) {
    return { label: ANONYMOUS_PUBLIC_LABEL, userId, anonymous: true }
  }

  return {
    label: trueUsername,
    userId,
    anonymous: false,
  }
}

/** System-message meta for X-Ray pierce of presented-identity labels (ADR 0149 / 0150). */
export function maskedAttributionMeta(
  ...attrs: ItemUseActorDisplayName[]
): { maskedUserIds: string[]; maskedLabel: string } | undefined {
  const masked = attrs.filter((a) => a.anonymous)
  if (masked.length === 0) return undefined
  return {
    maskedUserIds: masked.map((a) => a.userId),
    maskedLabel: masked[0]!.label,
  }
}

/**
 * Post a room-visible system line with X-Ray pierce meta attached when any
 * attribution was masked (ADR 0149 / 0150). `meta` is optional on the plugin
 * API, so unmasked lines simply pass `undefined` — do not branch at call sites.
 */
export async function sendAttributedSystemMessage(
  deps: ItemShopsBehaviorDeps,
  content: string,
  ...attrs: ItemUseActorDisplayName[]
): Promise<void> {
  const meta = maskedAttributionMeta(...attrs)
  if (meta) {
    await deps.context.api.sendSystemMessage(deps.context.roomId, content, meta)
    return
  }
  await deps.context.api.sendSystemMessage(deps.context.roomId, content)
}

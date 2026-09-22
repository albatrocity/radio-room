import type { ItemUseResult, PluginContext } from "@repo/types"

export type ResolveTargetUserOptions = {
  /** Explicit target; defaults to `actorId` when omitted. */
  targetUserId?: string
  /** When false, targeting yourself fails. Default true. */
  allowSelf?: boolean
  /** When true (default), target must be online in the room via `api.isUserInRoom`. */
  requireInRoom?: boolean
  /** Override when `allowSelf` is false and target is the actor. */
  selfDeniedMessage?: string
  /** Override when the target is not in the room. */
  notInRoomMessage?: string
  /**
   * When true, a missing/blank `targetUserId` fails instead of defaulting to the actor.
   */
  requireExplicitTarget?: boolean
  /** Override when `requireExplicitTarget` and no target was provided. */
  missingTargetMessage?: string
}

export type ResolveTargetUserOk = { ok: true; targetUserId: string }
export type ResolveTargetUserFail = { ok: false; result: ItemUseResult }
export type ResolveTargetUserResult = ResolveTargetUserOk | ResolveTargetUserFail

/**
 * Resolve an item-use target user: optional self-default, self-denial, and room presence.
 */
export async function resolveTargetUser(
  context: Pick<PluginContext, "api" | "roomId">,
  actorId: string,
  options: ResolveTargetUserOptions = {},
): Promise<ResolveTargetUserResult> {
  const allowSelf = options.allowSelf !== false
  const requireInRoom = options.requireInRoom !== false
  const raw = options.targetUserId?.trim()

  if (options.requireExplicitTarget && !raw) {
    return {
      ok: false,
      result: {
        success: false,
        consumed: false,
        message: options.missingTargetMessage ?? "Select a user.",
      },
    }
  }

  const targetUserId = raw || actorId

  if (!allowSelf && targetUserId === actorId) {
    return {
      ok: false,
      result: {
        success: false,
        consumed: false,
        message: options.selfDeniedMessage ?? "You can't use this on yourself.",
      },
    }
  }

  if (requireInRoom) {
    const inRoom = await context.api.isUserInRoom(context.roomId, targetUserId)
    if (!inRoom) {
      return {
        ok: false,
        result: {
          success: false,
          consumed: false,
          message: options.notInRoomMessage ?? "That user is not in this room.",
        },
      }
    }
  }

  return { ok: true, targetUserId }
}

import {
  COMIC_SANS_FLAG,
  ECHO_FLAG,
  GROW_FLAG,
  SHRINK_FLAG,
  GATE_FLAG,
  SCRAMBLE_FLAG,
} from "@repo/plugin-base"
import type {
  GameStateEffectWithMeta,
  ItemDefinition,
  ItemUseResult,
  PluginContext,
  GameSessionPluginAPI,
} from "@repo/types"
import {
  SCRATCHED_CD_SHORT_ID,
  ANALOG_DELAY_SHORT_ID,
  COMPRESSOR_SHORT_ID,
  BOOST_SHORT_ID,
  GATE_SHORT_ID,
  SAMPLE_HOLD_SHORT_ID,
  JOKER_PEDAL_SHORT_ID,
} from "./items"

/**
 * Dependencies passed into every item-use behavior (room API, game API, config snapshot).
 */
export type ItemShopsBehaviorDeps = {
  pluginName: string
  context: PluginContext
  game: GameSessionPluginAPI
  effectDurationMs: number
}

export type ItemUseHandler = (
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
) => Promise<ItemUseResult>

async function applyTargetedTimedModifier(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  callContext: unknown,
  definition: ItemDefinition,
  effectDurationMs: number,
  spec: {
    modifierName: string
    effects: GameStateEffectWithMeta[]
    successMessage: string
    describe: (p: { isSelf: boolean; actor: string; target: string }) => string
  },
): Promise<ItemUseResult> {
  const { context, game } = deps
  const targetUserId =
    (callContext as { targetUserId?: string } | undefined)?.targetUserId ?? userId
  const roomUsers = await context.api.getUsers(context.roomId)
  if (!roomUsers.some((u) => u.userId === targetUserId)) {
    return { success: false, consumed: false, message: "That user is not in this room." }
  }

  await game.applyTimedModifier(targetUserId, effectDurationMs, {
    name: spec.modifierName,
    effects: spec.effects,
    stackBehavior: "stack",
    itemDefinitionId: definition.id,
  })

  const [actor] = await context.api.getUsersByIds([userId])
  const [target] = await context.api.getUsersByIds([targetUserId])
  const actorName = actor?.username?.trim() || userId
  const targetName = target?.username?.trim() || targetUserId
  const isSelf = targetUserId === userId
  const who = spec.describe({ isSelf, actor: actorName, target: targetName })
  await context.api.sendSystemMessage(
    context.roomId,
    `${who} (${definition.name} — ${Math.round(effectDurationMs / 60_000)} min).`,
  )
  return { success: true, consumed: true, message: spec.successMessage }
}

async function useScratchedCd(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  _definition: ItemDefinition,
): Promise<ItemUseResult> {
  const { context, pluginName } = deps
  const np = await context.api.getNowPlaying(context.roomId)
  if (!np?.mediaSource?.trackId) {
    return { success: false, consumed: false, message: "Nothing is playing right now." }
  }
  try {
    await context.api.skipTrack(context.roomId, np.mediaSource.trackId)
  } catch (err) {
    console.error(`[${pluginName}] skipTrack failed`, err)
    return { success: false, consumed: false, message: "Could not skip the track." }
  }
  const [user] = await context.api.getUsersByIds([userId])
  const username = user?.username?.trim() || userId
  await context.api.sendSystemMessage(
    context.roomId,
    `${username} used a Scratched CD and skipped the current track!`,
  )
  return { success: true, consumed: true, message: "Used Scratched CD. It was lost with use." }
}

function useAnalogDelay(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  return applyTargetedTimedModifier(
    deps,
    userId,
    callContext,
    definition,
    deps.effectDurationMs,
    {
      modifierName: "analog_delay_echo",
      effects: [
        {
          type: "flag",
          name: ECHO_FLAG,
          value: true,
          icon: "square-stack",
          intent: "negative",
        },
      ],
      successMessage: "Analog Delay Pedal engaged. It was lost with use.",
      describe: ({ isSelf, actor, target }) =>
        isSelf ? `${actor} is hearing echoes` : `${target}'s chat echoes`,
    },
  )
}

function useCompressor(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  return applyTargetedTimedModifier(
    deps,
    userId,
    callContext,
    definition,
    deps.effectDurationMs,
    {
      modifierName: "compressor",
      effects: [
        { type: "flag", name: SHRINK_FLAG, value: true, icon: "shrink", intent: "negative" },
      ],
      successMessage: "Compressor engaged. It was lost with use.",
      describe: ({ isSelf, actor, target }) =>
        isSelf ? `${actor} is compressed` : `${target} has been compressed`,
    },
  )
}

function useBoost(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  return applyTargetedTimedModifier(
    deps,
    userId,
    callContext,
    definition,
    deps.effectDurationMs,
    {
      modifierName: "boost",
      effects: [
        { type: "flag", name: GROW_FLAG, value: true, icon: "chevrons-up", intent: "positive" },
      ],
      successMessage: "Boost engaged. It was lost with use.",
      describe: ({ isSelf, actor, target }) =>
        isSelf ? `${actor} is boosted` : `${target} is boosted`,
    },
  )
}

function useGate(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  return applyTargetedTimedModifier(
    deps,
    userId,
    callContext,
    definition,
    deps.effectDurationMs,
    {
      modifierName: "gate",
      effects: [{ type: "flag", name: GATE_FLAG, value: true, icon: "fence", intent: "negative" }],
      successMessage: "Gate engaged. It was lost with use.",
      describe: ({ isSelf, actor, target }) =>
        isSelf ? `${actor} is gated` : `${target} is gated`,
    },
  )
}

function useSampleHold(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  return applyTargetedTimedModifier(
    deps,
    userId,
    callContext,
    definition,
    deps.effectDurationMs,
    {
      modifierName: "sample-hold",
      effects: [
        {
          type: "flag",
          name: SCRAMBLE_FLAG,
          value: true,
          icon: "dices",
          intent: "negative",
        },
      ],
      successMessage: "Sample & Hold engaged. It was lost with use.",
      describe: ({ isSelf, actor, target }) =>
        isSelf ? `${actor} is randomized` : `${target} is randomized`,
    },
  )
}

function useJokerPedal(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  return applyTargetedTimedModifier(
    deps,
    userId,
    callContext,
    definition,
    deps.effectDurationMs,
    {
      modifierName: "joker_pedal",
      effects: [
        {
          type: "flag",
          name: COMIC_SANS_FLAG,
          value: true,
          icon: "laugh",
          intent: "negative",
        },
      ],
      successMessage: "Joker Pedal engaged. It was lost with use.",
      describe: ({ isSelf, actor, target }) =>
        isSelf ? `${actor} is in Comic Sans` : `${target}'s chat is in Comic Sans`,
    },
  )
}

/**
 * Registry of `shortId` → use handler. Add new items here and in `items.ts` / `shops.ts`.
 */
export const ITEM_USE_BEHAVIORS: Record<string, ItemUseHandler> = {
  [SCRATCHED_CD_SHORT_ID]: useScratchedCd,
  [ANALOG_DELAY_SHORT_ID]: useAnalogDelay,
  [COMPRESSOR_SHORT_ID]: useCompressor,
  [BOOST_SHORT_ID]: useBoost,
  [GATE_SHORT_ID]: useGate,
  [SAMPLE_HOLD_SHORT_ID]: useSampleHold,
  [JOKER_PEDAL_SHORT_ID]: useJokerPedal,
}

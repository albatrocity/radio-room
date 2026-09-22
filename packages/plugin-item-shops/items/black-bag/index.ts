import type { InventoryItem, ItemDefinition, ItemUseResult } from "@repo/types"
import { resolveSlotPool, slotPoolFullMessage } from "@repo/types"
import {
  sendAttributedSystemMessage,
  resolveItemUseActorDisplayName,
} from "../shared/resolveItemUseActorDisplayName"
import { resolveTargetUser } from "../shared/resolveTargetUser"
import { toDefenseBlockedUseResult } from "../shared/toDefenseBlockedUseResult"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

/** Probe flag so Warranty (`intents: ["negative"]`) still matches — never applied. */
const BURGLE_PROBE_FLAG = "burgled"

type PluginInventory = ItemShopsBehaviorDeps["context"]["inventory"]

/** Resolve catalog defs for victim stacks (bare shortId or plugin:shortId). */
async function definitionsByLookupId(
  inventory: PluginInventory,
  pluginName: string,
  definitionIds: readonly string[],
): Promise<Map<string, ItemDefinition>> {
  const unique = [...new Set(definitionIds.filter(Boolean))]
  const byLookup = new Map<string, ItemDefinition>()
  await Promise.all(
    unique.map(async (id) => {
      const def = await inventory.resolveDefinition(id, { pluginName })
      if (def) byLookup.set(id, def)
    }),
  )
  return byLookup
}

async function useBlackBag(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
  callContext?: unknown,
): Promise<ItemUseResult> {
  const { context, game, pluginName } = deps
  const ctx = callContext as { targetUserId?: string; targetInventoryItemId?: string } | undefined
  const targetInventoryItemId = ctx?.targetInventoryItemId?.trim()

  const resolved = await resolveTargetUser(context, userId, {
    targetUserId: ctx?.targetUserId,
    allowSelf: false,
    requireExplicitTarget: true,
    missingTargetMessage: "Select a user to burgle.",
    selfDeniedMessage: "You can't burgle yourself.",
  })
  if (!resolved.ok) return resolved.result
  const { targetUserId } = resolved

  const victimInv = await context.inventory.getInventory(targetUserId)
  const byDef = await definitionsByLookupId(
    context.inventory,
    pluginName,
    victimInv.items.map((s) => s.definitionId),
  )
  const stealable: { stack: InventoryItem; def: ItemDefinition }[] = []
  for (const stack of victimInv.items) {
    const def = byDef.get(stack.definitionId)
    if (!def) continue
    if (stack.quantity <= 0) continue
    stealable.push({ stack, def })
  }

  if (stealable.length === 0) {
    return { success: false, consumed: false, message: "They have nothing to steal." }
  }

  let pick: { stack: InventoryItem; def: ItemDefinition } | undefined
  if (targetInventoryItemId) {
    pick = stealable.find((s) => s.stack.itemId === targetInventoryItemId)
    if (!pick) {
      return {
        success: false,
        consumed: false,
        message: "That item is not in their inventory (or is not stealable).",
      }
    }
  } else {
    pick = stealable[Math.floor(Math.random() * stealable.length)]
  }
  if (!pick) {
    return { success: false, consumed: false, message: "They have nothing to steal." }
  }

  // Transactional steal: defense check only — no lasting modifier (ADR 0148).
  // omitBlockedModifier so Rubber Band blocks without rebound.
  const now = Date.now()
  const defense = await game.checkModifierDefense(
    targetUserId,
    {
      name: "black-bag",
      effects: [
        {
          type: "flag",
          name: BURGLE_PROBE_FLAG,
          value: true,
          intent: "negative",
          icon: definition.icon as never,
        },
      ],
      stackBehavior: "stack",
      itemDefinitionId: definition.id,
      startAt: now,
      endAt: now,
    },
    userId,
    { omitBlockedModifier: true },
  )

  if (!defense.ok) {
    if (defense.reason === "defense_blocked") {
      return toDefenseBlockedUseResult(defense)
    }
    return { success: false, consumed: false, message: "Could not apply effect." }
  }

  const removed = await context.inventory.removeItem(targetUserId, pick.stack.itemId, 1)
  if (!removed) {
    return {
      success: false,
      consumed: false,
      message: "Could not take that item (it may have moved).",
    }
  }

  const granted = await context.inventory.giveItem(
    userId,
    pick.stack.definitionId,
    1,
    pick.stack.metadata,
    "plugin",
  )
  if (!granted) {
    await context.inventory.giveItem(
      targetUserId,
      pick.stack.definitionId,
      1,
      pick.stack.metadata,
      "plugin",
    )
    const poolFull = slotPoolFullMessage(resolveSlotPool(pick.def), "nothing was stolen.")
    return {
      success: false,
      consumed: false,
      message: poolFull,
    }
  }

  const [actorName, targetName] = await Promise.all([
    resolveItemUseActorDisplayName(deps, userId),
    resolveItemUseActorDisplayName(deps, targetUserId),
  ])
  const label = pick.def.name
  await sendAttributedSystemMessage(
    deps,
    `${actorName.label} used a Black Bag and stole ${label} from ${targetName.label}!`,
    actorName,
    targetName,
  )
  await context.api.sendUserToast(context.roomId, targetUserId, {
    title: "Item stolen",
    description: `${actorName.label} stole your ${label} with a Black Bag.`,
    type: "error",
    source: "item-shops",
    id: `black-bag-stolen-${pick.stack.itemId}-${now}`,
  })

  return {
    success: true,
    consumed: true,
    message: `Stolen ${label}.`,
  }
}

export const blackBag = createItem({
  shortId: "black-bag",
  definition: {
    name: "Black Bag",
    description: "Steal an item from somebody else's inventory.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "userInventoryItem",
    coinValue: 100,
    icon: "PaperBag",
    rarity: "legendary",
  },
  use: useBlackBag,
})

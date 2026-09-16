import type { ItemDefinition, ItemUseResult } from "@repo/types"
import {
  applySweetwaterDoNotCall,
  isSweetwaterDoNotCall,
  SWEETWATER_SHOP_ID,
} from "../../shops/sweetwater/followUps"
import {
  resolveItemUseActorDisplayName,
  sendAttributedSystemMessage,
} from "../shared/resolveItemUseActorDisplayName"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

/**
 * Screens the Sweetwater sales rep for the acting user only — never a target. Reaches the
 * Sweetwater shop's state and follow-up timer through `shopAccess` (ADR 0183), so the
 * silence lasts as long as the rep's own loop: until the game session ends.
 */
async function useCallScreener(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  _definition: ItemDefinition,
): Promise<ItemUseResult> {
  const { shopAccess } = deps
  if (!shopAccess) {
    return { success: false, consumed: false, message: "Could not screen your calls." }
  }

  const getState = <T>(key: string): T | undefined =>
    shopAccess.getState<T>(SWEETWATER_SHOP_ID, key)

  if (isSweetwaterDoNotCall(getState, userId)) {
    return {
      success: false,
      consumed: false,
      message: "Your calls are already screened. Chuck can't reach you.",
    }
  }

  applySweetwaterDoNotCall(
    {
      setState: (key, value) => shopAccess.setState(SWEETWATER_SHOP_ID, key, value),
      clearTimer: (id) => shopAccess.clearTimer(SWEETWATER_SHOP_ID, id),
    },
    userId,
  )

  const actorName = await resolveItemUseActorDisplayName(deps, userId)
  await sendAttributedSystemMessage(
    deps,
    `${actorName.label} is screening their calls. The Sweetwater rep will have to leave a message.`,
    actorName,
  )

  return {
    success: true,
    consumed: true,
    message: "Calls screened. No more check-ins from your Sweetwater rep this show.",
  }
}

export const callScreener = createItem({
  shortId: "call-screener",
  definition: {
    name: "Call Screener",
    description:
      "Sweet relief. Stops Sweetwater's incessant follow-up messages for the rest of the show.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    requiresTarget: "self",
    coinValue: 25,
    icon: "PhoneOff",
    rarity: "uncommon",
  },
  use: useCallScreener,
})

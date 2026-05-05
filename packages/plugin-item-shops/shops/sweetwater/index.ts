import type { ItemShopsShopCatalogEntry, ShopBuyContext } from "@repo/plugin-base/helpers"
import {
  ANALOG_DELAY_SHORT_ID,
  BOOST_SHORT_ID,
  COMPRESSOR_SHORT_ID,
  GATE_SHORT_ID,
  JOKER_PEDAL_SHORT_ID,
  SAMPLE_HOLD_SHORT_ID,
} from "../../items"
import { formatSweetwaterMessage, pickRandomSweetwaterMessage } from "./messages"

/** 10 minutes between Sweetwater sales rep follow-ups */
const SWEETWATER_FOLLOWUP_MS = 10 * 60 * 1000

type SweetwaterUserState = { username: string; lastPurchasedItemName: string }

function sweetwaterTimerId(userId: string): string {
  return `followup:${userId}`
}

async function deliverSweetwaterFollowUpAndReschedule(
  ctx: ShopBuyContext,
  userId: string,
): Promise<void> {
  const state = ctx.getState<SweetwaterUserState>(userId)
  if (!state) return

  if (!(await ctx.isGameSessionActive())) {
    ctx.clearTimer(sweetwaterTimerId(userId))
    ctx.deleteState(userId)
    return
  }

  if (!(await ctx.isUserInRoom(userId))) {
    ctx.clearTimer(sweetwaterTimerId(userId))
    ctx.deleteState(userId)
    return
  }

  const template = pickRandomSweetwaterMessage()
  const content = formatSweetwaterMessage(
    template,
    state.username,
    state.lastPurchasedItemName,
  )
  await ctx.sendSystemMessage(
    content,
    { type: "alert", status: "info", title: "Message from your Sweetwater Rep" },
    [state.username],
  )

  ctx.startTimer(sweetwaterTimerId(userId), {
    duration: SWEETWATER_FOLLOWUP_MS,
    data: { userId },
    callback: async () => {
      await deliverSweetwaterFollowUpAndReschedule(ctx, userId)
    },
  })
}

function sweetwaterOnBuy(ctx: ShopBuyContext): void {
  ctx.setState<SweetwaterUserState>(ctx.userId, {
    username: ctx.username,
    lastPurchasedItemName: ctx.itemName,
  })

  const timerId = sweetwaterTimerId(ctx.userId)
  if (ctx.getTimer(timerId) !== null) {
    return
  }

  ctx.startTimer(timerId, {
    duration: SWEETWATER_FOLLOWUP_MS,
    data: { userId: ctx.userId },
    callback: async () => {
      await deliverSweetwaterFollowUpAndReschedule(ctx, ctx.userId)
    },
  })
}

export const SWEETWATER_SHOP: ItemShopsShopCatalogEntry = {
  shopId: "sweetwater",
  name: "Sweetwater",
  openingMessage:
    "{{shopName}} would love to guide you on your gear journey! Check out our selection in the Item Shop tab and reach out to one of our friendly gear experts!",
  availableItems: [
    { shortId: ANALOG_DELAY_SHORT_ID, coinValue: 10 },
    { shortId: COMPRESSOR_SHORT_ID, coinValue: 15 },
    { shortId: BOOST_SHORT_ID, coinValue: 20 },
    { shortId: GATE_SHORT_ID, coinValue: 25 },
    { shortId: JOKER_PEDAL_SHORT_ID, coinValue: 28 },
    { shortId: SAMPLE_HOLD_SHORT_ID, coinValue: 30 },
  ],
  listedBuybackRate: 0.5,
  unlistedBuybackRate: 0.25,
  onBuy: sweetwaterOnBuy,
}

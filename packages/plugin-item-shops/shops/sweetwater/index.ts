import type { ItemShopsShopCatalogEntry, ShopBuyContext } from "@repo/plugin-base/helpers"
import { items } from "../../items"
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
  const content = formatSweetwaterMessage(template, state.username, state.lastPurchasedItemName)
  await ctx.sendUserSystemMessage(userId, content, {
    type: "alert",
    status: "info",
    title: "Message from your Sweetwater Rep",
  })

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
    "Hi! It's Chuck, from {{shopName}}! Come check out the shop. We can take your sound to the next level! Together :)",
  availableItems: [
    { shortId: items.analogDelayPedal.shortId, coinValue: 20 },
    { shortId: items.compressorPedal.shortId, coinValue: 10 },
    { shortId: items.boostPedal.shortId, coinValue: 10 },
    { shortId: items.bufferPedal.shortId, coinValue: 30 },
    { shortId: items.fuzzPedal.shortId, coinValue: 25 },
    { shortId: items.tubeOverdrive.shortId, coinValue: 20 },
    { shortId: items.gate.shortId, coinValue: 25 },
    { shortId: items.jokerPedal.shortId, coinValue: 28 },
    { shortId: items.sampleHold.shortId, coinValue: 30 },
    { shortId: items.warranty.shortId, coinValue: 25 },
    { shortId: items.snoozePedal.shortId, coinValue: 30 },
    { shortId: items.coffeePedal.shortId, coinValue: 10 },
    { shortId: items.nineVoltBattery.shortId, coinValue: 20 },
  ],
  listedBuybackRate: 0.5,
  unlistedBuybackRate: 0.25,
  onBuy: sweetwaterOnBuy,
}

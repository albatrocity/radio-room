import type { ItemShopsShopCatalogEntry, ShopBuyContext } from "@repo/plugin-base/helpers"
import type { ChatMessage } from "@repo/types"
import { items } from "../../items"
import { isSweetwaterDoNotCall, SWEETWATER_SHOP_ID, sweetwaterTimerId } from "./followUps"

/** 10 minutes between Sweetwater sales rep follow-ups */
const SWEETWATER_FOLLOWUP_MS = 10 * 60 * 1000

const SWEETWATER_REP_ALERT_META: ChatMessage["meta"] = {
  type: "alert",
  status: "info",
  title: "Message from your Sweetwater Rep",
}

type SweetwaterUserState = { username: string; lastPurchasedItemName: string }

function sweetwaterOnBuy(ctx: ShopBuyContext): void {
  ctx.setState<SweetwaterUserState>(ctx.userId, {
    username: ctx.username,
    lastPurchasedItemName: ctx.itemName,
  })

  if (isSweetwaterDoNotCall(ctx.getState, ctx.userId)) {
    return
  }

  const timerId = sweetwaterTimerId(ctx.userId)
  if (ctx.getTimer(timerId) !== null) {
    return
  }

  void ctx.schedule({
    id: timerId,
    kind: "sweetwater-followup",
    durationMs: SWEETWATER_FOLLOWUP_MS,
    payload: { userId: ctx.userId },
  })
}

/**
 * Theme: toys and gear gadgets — pedals and radio toys you can use on yourself
 * or others (including for mildly nefarious chat mischief). Assignment rarity:
 * common (ADR 0175).
 */
export const SWEETWATER_SHOP: ItemShopsShopCatalogEntry = {
  shopId: SWEETWATER_SHOP_ID,
  name: "Sweetwater",
  rarity: "common",
  openingMessage:
    "Hi! It's Chuck, from {{shopName}}! Come check out the shop. We can take your sound to the next level! Together :)",
  openingMessageMeta: SWEETWATER_REP_ALERT_META,
  availableItems: [
    { shortId: items.analogDelayPedal.shortId, coinValue: 20 },
    { shortId: items.compressorPedal.shortId, coinValue: 10 },
    { shortId: items.boostPedal.shortId, coinValue: 10 },
    { shortId: items.bufferPedal.shortId, coinValue: 25 },
    { shortId: items.fuzzPedal.shortId, coinValue: 25 },
    { shortId: items.tubeOverdrive.shortId, coinValue: 10 },
    { shortId: items.gate.shortId, coinValue: 35 },
    { shortId: items.jokerPedal.shortId, coinValue: 28 },
    { shortId: items.sampleHold.shortId, coinValue: 60 },
    { shortId: items.warranty.shortId, coinValue: 25 },
    { shortId: items.snoozePedal.shortId, coinValue: 40 },
    { shortId: items.coffeePedal.shortId, coinValue: 15 },
    { shortId: items.nineVoltBattery.shortId, coinValue: 20 },
    { shortId: items.oscilloscope.shortId, coinValue: 50 },
    { shortId: items.vuMeter.shortId, coinValue: 50 },
    { shortId: items.chromaticTuner.shortId, coinValue: 50 },
    { shortId: items.beatDetector.shortId, coinValue: 50 },
  ],
  listedBuybackRate: 0.5,
  unlistedBuybackRate: 0.25,
  onBuy: sweetwaterOnBuy,
}

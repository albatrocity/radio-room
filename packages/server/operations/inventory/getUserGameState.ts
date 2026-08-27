import type {
  AppContext,
  GiftOffer,
  InventoryItem,
  ItemDefinition,
  TradeInvite,
  TradeSession,
  UserGameStatePayload,
} from "@repo/types"
import { collectInventoryAndModifierDefinitionIds } from "../../lib/collectUserGameStateDefinitionIds"

type PluginRegistryHooks = {
  invokeGetSellbackValues?: (
    roomId: string,
    items: InventoryItem[],
    definitionById: Map<string, ItemDefinition>,
  ) => Promise<Record<string, number>>
  invokeContributeToUserGameState?: (
    roomId: string,
    userId: string,
    ctx: { itemDefinitions: ItemDefinition[] },
  ) => Promise<Record<string, Record<string, unknown>>>
  invokeReferencedItemDefinitionIdsForUser?: (
    roomId: string,
    userId: string,
  ) => Promise<string[]>
}

const EMPTY_PAYLOAD: UserGameStatePayload = {
  session: null,
  state: null,
  inventory: null,
  itemDefinitions: [],
  pluginUserState: {},
}

export async function getUserGameState(params: {
  context: AppContext
  roomId: string
  userId: string
}): Promise<UserGameStatePayload> {
  const { context, roomId, userId } = params
  const gameSessions = context.gameSessions
  const inventory = context.inventory

  if (!gameSessions) {
    return EMPTY_PAYLOAD
  }

  const session = await gameSessions.getActiveSession(roomId)
  if (!session) {
    return EMPTY_PAYLOAD
  }

  const state = await gameSessions.getUserState(roomId, userId)
  const inv = inventory ? await inventory.getInventory(roomId, userId) : null

  const registry = context.pluginRegistry as PluginRegistryHooks | undefined

  const pluginExtraIds = registry?.invokeReferencedItemDefinitionIdsForUser
    ? await registry.invokeReferencedItemDefinitionIdsForUser(roomId, userId)
    : []
  const neededIds = [...collectInventoryAndModifierDefinitionIds(inv, state), ...pluginExtraIds]
  const itemDefinitions = inventory ? await inventory.getItemDefinitions(roomId, neededIds) : []

  const definitionById = new Map<string, ItemDefinition>(
    itemDefinitions.map((d: ItemDefinition) => [d.id, d]),
  )

  let inventoryPayload = inv
  if (inv && registry?.invokeGetSellbackValues) {
    const sellbackValues = await registry.invokeGetSellbackValues(roomId, inv.items, definitionById)
    inventoryPayload = {
      ...inv,
      items: inv.items.map((i: InventoryItem) => {
        const v = sellbackValues[i.itemId]
        return v != null ? { ...i, sellbackValue: v } : i
      }),
    }
  }

  const pluginUserState = registry?.invokeContributeToUserGameState
    ? await registry.invokeContributeToUserGameState(roomId, userId, { itemDefinitions })
    : {}

  const tradingEnabled = session.config.allowTrading === true
  let pendingGifts: { incoming: GiftOffer[]; outgoing: GiftOffer[] } | undefined
  let pendingTradeInvites: { incoming: TradeInvite[]; outgoing: TradeInvite[] } | undefined
  let activeTrade: TradeSession | null | undefined
  if (tradingEnabled) {
    const [incoming, outgoing, incomingInvites, outgoingInvites, trade] = await Promise.all([
      context.gifts ? context.gifts.listIncoming(roomId, userId) : Promise.resolve([] as GiftOffer[]),
      context.gifts ? context.gifts.listOutgoing(roomId, userId) : Promise.resolve([] as GiftOffer[]),
      context.trades
        ? context.trades.listIncomingInvites(roomId, userId)
        : Promise.resolve([] as TradeInvite[]),
      context.trades
        ? context.trades.listOutgoingInvites(roomId, userId)
        : Promise.resolve([] as TradeInvite[]),
      context.trades ? context.trades.getTradeForUser(roomId, userId) : Promise.resolve(null),
    ])
    if (context.gifts) {
      pendingGifts = { incoming, outgoing }
    }
    if (context.trades) {
      pendingTradeInvites = { incoming: incomingInvites, outgoing: outgoingInvites }
      activeTrade = trade
    }
  }

  return {
    session,
    state,
    inventory: inventoryPayload,
    itemDefinitions,
    pluginUserState,
    pendingGifts,
    pendingTradeInvites,
    activeTrade: activeTrade ?? null,
  }
}

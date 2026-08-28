import type {
  AppContext,
  GiftOffer,
  InventoryItem,
  ItemDefinition,
  TradeInvite,
  TradeSession,
  UserGameStatePayload,
} from "@repo/types"
import { collectGiftOfferDefinitionIds, collectInventoryAndModifierDefinitionIds } from "../../lib/collectUserGameStateDefinitionIds"

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
  const tradingEnabled = session.config.allowTrading === true

  const emptyGifts: GiftOffer[] = []
  const [pluginExtraIds, incoming, outgoing, incomingInvites, outgoingInvites, trade] =
    await Promise.all([
      registry?.invokeReferencedItemDefinitionIdsForUser
        ? registry.invokeReferencedItemDefinitionIdsForUser(roomId, userId)
        : Promise.resolve([] as string[]),
      tradingEnabled && context.gifts
        ? context.gifts.listIncoming(roomId, userId)
        : Promise.resolve(emptyGifts),
      tradingEnabled && context.gifts
        ? context.gifts.listOutgoing(roomId, userId)
        : Promise.resolve(emptyGifts),
      tradingEnabled && context.trades
        ? context.trades.listIncomingInvites(roomId, userId)
        : Promise.resolve([] as TradeInvite[]),
      tradingEnabled && context.trades
        ? context.trades.listOutgoingInvites(roomId, userId)
        : Promise.resolve([] as TradeInvite[]),
      tradingEnabled && context.trades
        ? context.trades.getTradeForUser(roomId, userId)
        : Promise.resolve(null as TradeSession | null),
    ])

  const neededIds = [
    ...collectInventoryAndModifierDefinitionIds(inv, state),
    ...pluginExtraIds,
    ...collectGiftOfferDefinitionIds([...incoming, ...outgoing]),
  ]
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

  let pendingGifts: { incoming: GiftOffer[]; outgoing: GiftOffer[] } | undefined
  let pendingTradeInvites: { incoming: TradeInvite[]; outgoing: TradeInvite[] } | undefined
  let activeTrade: TradeSession | null | undefined
  if (tradingEnabled) {
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

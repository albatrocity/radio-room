import { useMemo } from "react"
import { useUserGameStatePayload } from "../../../../hooks/useActors"
import { itemDefinitionMap } from "../../../../lib/itemDefinitionMap"
import { emitTradeSetOffer } from "../../../../lib/tradeSocketActions"
import { useTradeParticipants } from "./useTradeParticipants"

type SelectableTradeItem = {
  itemId: string
  definitionId: string
  name: string
  quantity: number
}

type PickerUnit = SelectableTradeItem & { unitKey: string }

export function useTradeOfferDraft(tradeId: string) {
  const payload = useUserGameStatePayload()
  const { activeTrade, mine } = useTradeParticipants(tradeId)

  const definitionMap = useMemo(
    () => itemDefinitionMap(payload?.itemDefinitions),
    [payload?.itemDefinitions],
  )

  const bagItems = payload?.inventory?.items ?? []
  const selectable = useMemo(() => {
    const rows: SelectableTradeItem[] = []
    for (const item of bagItems) {
      const def = definitionMap.get(item.definitionId)
      if (!def?.tradeable) continue
      rows.push({
        itemId: item.itemId,
        definitionId: item.definitionId,
        name: def.name,
        quantity: item.quantity,
      })
    }
    return rows
  }, [bagItems, definitionMap])

  const offeredQtyById = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of mine?.draft ?? []) m.set(d.itemId, d.quantity)
    return m
  }, [mine?.draft])

  const remainingInventory = useMemo(() => {
    const rows: PickerUnit[] = []
    // After lock, escrow already debited the bag — don't subtract draft again.
    const subtractDraft = !mine?.locked
    for (const item of selectable) {
      const offered = subtractDraft ? (offeredQtyById.get(item.itemId) ?? 0) : 0
      const left = Math.max(0, item.quantity - offered)
      for (let i = 0; i < left; i++) {
        rows.push({ ...item, quantity: 1, unitKey: `${item.itemId}:${i}` })
      }
    }
    return rows
  }, [selectable, offeredQtyById, mine?.locked])

  const offeredCount = mine?.locked
    ? mine.offer.reduce((n, row) => n + row.quantity, 0)
    : (mine?.draft ?? []).reduce((n, row) => n + row.quantity, 0)
  const canEdit = !!(activeTrade && mine && !mine.locked)

  const emitOffer = (items: { itemId: string; quantity: number }[]) => {
    if (!activeTrade) return
    emitTradeSetOffer(activeTrade.tradeId, items)
  }

  const addToOffer = (itemId: string) => {
    if (!canEdit) return
    const bag = bagItems.find((i) => i.itemId === itemId)
    if (!bag) return
    const current = offeredQtyById.get(itemId) ?? 0
    if (current >= bag.quantity) return
    const items = (mine?.draft ?? []).map((d) => ({ itemId: d.itemId, quantity: d.quantity }))
    const existing = items.find((row) => row.itemId === itemId)
    if (existing) existing.quantity += 1
    else items.push({ itemId, quantity: 1 })
    emitOffer(items)
  }

  const removeFromOffer = (itemId: string) => {
    if (!canEdit) return
    emitOffer(
      (mine?.draft ?? [])
        .map((d) => ({
          itemId: d.itemId,
          quantity: d.itemId === itemId ? d.quantity - 1 : d.quantity,
        }))
        .filter((d) => d.quantity > 0),
    )
  }

  return {
    definitionMap,
    selectable,
    remainingInventory,
    offeredCount,
    canEdit,
    addToOffer,
    removeFromOffer,
  }
}

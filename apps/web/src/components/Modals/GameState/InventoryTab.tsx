import { useEffect, useRef, useState } from "react"
import { Badge, Box, Button, HStack, Heading, Stack, Text, VStack } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { toaster } from "../../ui/toaster"

interface InventoryTabProps {
  items: InventoryItem[]
  maxSlots: number
  definitionMap: Map<string, ItemDefinition>
}

interface InventoryRowProps {
  item: InventoryItem
  definition?: ItemDefinition
}

/** Track per-item action loading state without re-rendering the whole tab. */
type PendingAction = { itemId: string; action: "use" | "sell" } | null

function InventoryRow({ item, definition }: InventoryRowProps) {
  const name = definition?.name ?? item.definitionId
  const description = definition?.description
  const icon = definition?.icon
  const consumable = definition?.consumable ?? false
  const tradeable = definition?.tradeable ?? false
  const coinValue = definition?.coinValue ?? 0
  const sellable = tradeable && coinValue > 0

  const [pending, setPending] = useState<PendingAction>(null)
  const subscriptionIdRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      const id = subscriptionIdRef.current
      if (id) unsubscribeById(id)
    }
  }, [])

  const dispatch = (action: "use" | "sell") => {
    const subscriptionId = `inventory-${action}-${item.itemId}-${Date.now()}`
    subscriptionIdRef.current = subscriptionId
    setPending({ itemId: item.itemId, action })

    subscribeById(subscriptionId, {
      send: (event: { type: string; data?: { success: boolean; message?: string } }) => {
        if (event.type !== "INVENTORY_ACTION_RESULT" || !event.data) return
        unsubscribeById(subscriptionId)
        if (subscriptionIdRef.current === subscriptionId) {
          subscriptionIdRef.current = null
        }
        setPending(null)
        toaster.create({
          title: event.data.success ? "Success" : "Error",
          description:
            event.data.message ||
            (event.data.success ? "Action completed" : "Action failed"),
          type: event.data.success ? "success" : "error",
        })
      },
    })

    if (action === "use") {
      emitToSocket("USE_INVENTORY_ITEM", { itemId: item.itemId })
    } else {
      emitToSocket("SELL_INVENTORY_ITEM", { itemId: item.itemId })
    }

    setTimeout(() => {
      if (subscriptionIdRef.current === subscriptionId) {
        unsubscribeById(subscriptionId)
        subscriptionIdRef.current = null
        setPending(null)
        toaster.create({
          title: "Timeout",
          description: "Action timed out",
          type: "error",
        })
      }
    }, 10000)
  }

  return (
    <HStack
      align="flex-start"
      gap={3}
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      p={3}
    >
      {icon && (
        <Box fontSize="2xl" lineHeight="1" pt="2px">
          {icon}
        </Box>
      )}
      <VStack align="start" gap={0} flex="1" minW={0}>
        <HStack gap={2} flexWrap="wrap">
          <Text fontWeight="medium">{name}</Text>
          {item.quantity > 1 && (
            <Badge size="sm" variant="subtle">
              ×{item.quantity}
            </Badge>
          )}
        </HStack>
        {description && (
          <Text fontSize="xs" color="fg.muted">
            {description}
          </Text>
        )}
      </VStack>
      <HStack gap={2}>
        {consumable && (
          <Button
            size="xs"
            variant="solid"
            colorPalette="action"
            loading={pending?.itemId === item.itemId && pending.action === "use"}
            onClick={() => dispatch("use")}
          >
            Use
          </Button>
        )}
        {sellable && (
          <Button
            size="xs"
            variant="outline"
            loading={pending?.itemId === item.itemId && pending.action === "sell"}
            onClick={() => dispatch("sell")}
          >
            Sell
          </Button>
        )}
      </HStack>
    </HStack>
  )
}

function InventoryTab({ items, maxSlots, definitionMap }: InventoryTabProps) {
  return (
    <Box>
      <HStack justify="space-between" align="baseline" mb={2}>
        <Heading size="sm">Inventory</Heading>
        {maxSlots > 0 && (
          <Text fontSize="xs" color="fg.muted">
            {items.length} / {maxSlots} slots
          </Text>
        )}
      </HStack>

      {items.length === 0 ? (
        <Text fontSize="sm" color="fg.muted">
          Your inventory is empty.
        </Text>
      ) : (
        <Stack gap={2}>
          {items.map((item) => (
            <InventoryRow
              key={item.itemId}
              item={item}
              definition={definitionMap.get(item.definitionId)}
            />
          ))}
        </Stack>
      )}
    </Box>
  )
}

export default InventoryTab

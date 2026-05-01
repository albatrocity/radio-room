import { useEffect, useMemo, useRef, useState } from "react"
import {
  Badge,
  Box,
  HStack,
  Heading,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import type {
  GameAttributeName,
  GameSession,
  InventoryItem,
  ItemDefinition,
  UserGameState,
  UserInventory,
} from "@repo/types"
import Modal from "../Modal"
import { useIsModalOpen, useModalsSend, useCurrentUser } from "../../hooks/useActors"
import { emitToSocket, subscribeById, unsubscribeById } from "../../actors/socketActor"

const SUBSCRIPTION_ID = "user-game-state-modal"

interface UserGameStatePayload {
  session: GameSession | null
  state: UserGameState | null
  inventory: UserInventory | null
  itemDefinitions?: ItemDefinition[]
}

function attributeLabel(attribute: GameAttributeName): string {
  if (attribute === "score") return "Score"
  if (attribute === "coin") return "Coins"
  if (attribute.includes(":")) {
    const [pluginName, name] = attribute.split(":")
    const pretty = (s: string) =>
      s
        .split("-")
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ""))
        .join(" ")
    return `${pretty(pluginName ?? "")} · ${pretty(name ?? "")}`
  }
  return attribute
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

interface InventoryRowProps {
  item: InventoryItem
  definition?: ItemDefinition
}

function InventoryRow({ item, definition }: InventoryRowProps) {
  const name = definition?.name ?? item.definitionId
  const description = definition?.description
  const icon = definition?.icon

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
    </HStack>
  )
}

function ModalUserGameState() {
  const modalSend = useModalsSend()
  const isOpen = useIsModalOpen("gameState")
  const currentUser = useCurrentUser()

  const [payload, setPayload] = useState<UserGameStatePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** Used to ignore stale ERROR_OCCURRED events that don't belong to this fetch. */
  const seenStatusRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return

    seenStatusRef.current = false
    setLoading(true)
    setError(null)

    subscribeById(SUBSCRIPTION_ID, {
      send: (event: { type: string; data?: unknown }) => {
        if (event.type === "USER_GAME_STATE") {
          seenStatusRef.current = true
          setLoading(false)
          setPayload(event.data as UserGameStatePayload)
          return
        }

        // Refresh state when broadcast events change anything relevant for me.
        if (
          event.type === "GAME_STATE_CHANGED" ||
          event.type === "GAME_MODIFIER_APPLIED" ||
          event.type === "GAME_MODIFIER_REMOVED" ||
          event.type === "INVENTORY_ITEM_ACQUIRED" ||
          event.type === "INVENTORY_ITEM_REMOVED" ||
          event.type === "INVENTORY_ITEM_USED" ||
          event.type === "INVENTORY_ITEM_TRANSFERRED"
        ) {
          const d = event.data as { userId?: string } | undefined
          if (!currentUser?.userId || !d?.userId || d.userId === currentUser.userId) {
            emitToSocket("GET_MY_GAME_STATE", {})
          }
          return
        }

        if (event.type === "GAME_SESSION_ENDED") {
          setPayload({ session: null, state: null, inventory: null, itemDefinitions: [] })
          return
        }

        if (event.type === "ERROR_OCCURRED" && !seenStatusRef.current) {
          const err = event.data as { message?: string } | undefined
          setLoading(false)
          setError(err?.message ?? "Could not load your game state.")
        }
      },
    })

    emitToSocket("GET_MY_GAME_STATE", {})

    return () => {
      unsubscribeById(SUBSCRIPTION_ID)
    }
  }, [isOpen, currentUser?.userId])

  const definitionMap = useMemo(() => {
    const map = new Map<string, ItemDefinition>()
    for (const def of payload?.itemDefinitions ?? []) {
      map.set(def.id, def)
    }
    return map
  }, [payload?.itemDefinitions])

  const enabledAttributes = payload?.session?.config.enabledAttributes ?? []
  const attributes = payload?.state?.attributes ?? ({} as Record<GameAttributeName, number>)
  const inventoryEnabled = payload?.session?.config.inventoryEnabled ?? false
  const inventoryItems = payload?.inventory?.items ?? []
  const maxSlots = payload?.inventory?.maxSlots ?? 0

  const heading = (
    <HStack gap={2} flexWrap="wrap">
      {payload?.session && (
        <Badge size="sm" colorPalette="green" variant="solid">
          {payload.session.config.name}
        </Badge>
      )}
    </HStack>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => modalSend({ type: "CLOSE" })}
      heading={heading}
      showFooter={false}
    >
      <Stack gap={5}>
        {loading && (
          <HStack>
            <Spinner size="sm" />
            <Text fontSize="sm" color="fg.muted">
              Loading your stats…
            </Text>
          </HStack>
        )}

        {!loading && error && (
          <Text fontSize="sm" color="red.500">
            {error}
          </Text>
        )}

        {!loading && !error && !payload?.session && (
          <Text fontSize="sm" color="fg.muted">
            No game session is running right now.
          </Text>
        )}

        {!loading && !error && payload?.session && (
          <>
            <Box>
              <Heading size="sm" mb={2}>
                Attributes
              </Heading>
              {enabledAttributes.length === 0 ? (
                <Text fontSize="sm" color="fg.muted">
                  No attributes are enabled for this session.
                </Text>
              ) : (
                <SimpleGrid columns={{ base: 2, sm: 3 }} gap={3}>
                  {enabledAttributes.map((attr) => (
                    <Box
                      key={attr}
                      borderWidth="1px"
                      borderColor="border.muted"
                      borderRadius="md"
                      p={3}
                      bg="bg.subtle"
                    >
                      <Text fontSize="xs" color="fg.muted">
                        {attributeLabel(attr)}
                      </Text>
                      <Text fontSize="2xl" fontWeight="semibold">
                        {formatNumber(attributes[attr] ?? 0)}
                      </Text>
                    </Box>
                  ))}
                </SimpleGrid>
              )}
            </Box>

            {inventoryEnabled && (
              <Box>
                <HStack justify="space-between" align="baseline" mb={2}>
                  <Heading size="sm">Inventory</Heading>
                  {maxSlots > 0 && (
                    <Text fontSize="xs" color="fg.muted">
                      {inventoryItems.length} / {maxSlots} slots
                    </Text>
                  )}
                </HStack>

                {inventoryItems.length === 0 ? (
                  <Text fontSize="sm" color="fg.muted">
                    Your inventory is empty.
                  </Text>
                ) : (
                  <Stack gap={2}>
                    {inventoryItems.map((item) => (
                      <InventoryRow
                        key={item.itemId}
                        item={item}
                        definition={definitionMap.get(item.definitionId)}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            )}
          </>
        )}
      </Stack>
    </Modal>
  )
}

export default ModalUserGameState

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Badge,
  Box,
  HStack,
  Heading,
  Icon,
  SimpleGrid,
  Spinner,
  Stack,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import type {
  GameAttributeName,
  GameSession,
  ItemDefinition,
  PluginComponentDefinition,
  PluginTabComponent,
  UserGameState,
  UserInventory,
} from "@repo/types"
import { checkShowWhenConditions } from "@repo/utils"
import Modal from "../Modal"
import {
  useIsModalOpen,
  useModalsSend,
  useCurrentUser,
  usePluginConfigs,
} from "../../hooks/useActors"
import { usePluginSchemas } from "../../hooks/usePluginSchemas"
import { emitToSocket, subscribeById, unsubscribeById } from "../../actors/socketActor"
import {
  PluginComponentProvider,
  PluginComponentRenderer,
} from "../PluginComponents/PluginComponentRenderer"
import { getIcon } from "../PluginComponents/icons"
import { UserGameStateContext, type UserGameStateSnapshot } from "./UserGameStateContext"
import InventoryTab from "./GameState/InventoryTab"

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

interface PluginTabEntry {
  id: string
  pluginName: string
  label: string
  icon?: string
  config: Record<string, unknown>
  storeKeys: string[]
  components: PluginComponentDefinition[]
  tab: PluginTabComponent
}

function ModalUserGameState() {
  const modalSend = useModalsSend()
  const isOpen = useIsModalOpen("gameState")
  const currentUser = useCurrentUser()
  const { schemas } = usePluginSchemas()
  const pluginConfigs = usePluginConfigs() || {}

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
  /** Score and coin are shown in the modal footer; omit from the Stats grid to avoid duplication. */
  const enabledAttributesForGrid = useMemo(
    () => enabledAttributes.filter((a) => a !== "score" && a !== "coin"),
    [enabledAttributes],
  )
  const attributes = (payload?.state?.attributes ?? {}) as Record<GameAttributeName, number>
  const inventoryEnabled = payload?.session?.config.inventoryEnabled ?? false
  const inventoryItems = payload?.inventory?.items ?? []
  const maxSlots = payload?.inventory?.maxSlots ?? 0

  // Collect plugin-registered tabs for the gameStateTab area, filtered by
  // their showWhen conditions (evaluated against config + an empty store
  // because tabs are visible at the bar level regardless of per-instance
  // store data).
  const pluginTabs = useMemo<PluginTabEntry[]>(() => {
    const result: PluginTabEntry[] = []
    for (const schema of schemas) {
      const components = schema.componentSchema?.components ?? []
      const tabs = components.filter(
        (c): c is PluginTabComponent =>
          c.type === "tab" && c.area === "gameStateTab",
      )
      if (tabs.length === 0) continue

      const config = pluginConfigs[schema.name] || schema.defaultConfig || {}
      const storeKeys = schema.componentSchema?.storeKeys || []

      for (const tab of tabs) {
        if (tab.showWhen && !checkShowWhenConditions(tab.showWhen, config, {})) {
          continue
        }
        result.push({
          id: `${schema.name}:${tab.id}`,
          pluginName: schema.name,
          label: tab.label,
          icon: tab.icon,
          config,
          storeKeys,
          components,
          tab,
        })
      }
    }
    return result
  }, [schemas, pluginConfigs])

  const heading = (
    <HStack gap={2} flexWrap="wrap">
      {payload?.session && (
        <Badge size="sm" colorPalette="green" variant="solid">
          {payload.session.config.name}
        </Badge>
      )}
    </HStack>
  )

  const gameStateValue = useMemo<UserGameStateSnapshot>(() => {
    return {
      session: payload?.session ?? null,
      state: payload?.state ?? null,
      inventory: payload?.inventory ?? null,
      itemDefinitions: payload?.itemDefinitions ?? [],
      getAttribute: (attribute: GameAttributeName) => attributes[attribute] ?? 0,
    }
  }, [payload, attributes])

  const showGameFooter =
    !loading && !error && !!payload?.session

  const footer = showGameFooter ? (
    <HStack justify="space-between" width="full" flexWrap="wrap" gap={4}>
      <HStack gap={2}>
        <Text fontSize="sm" color="fg.muted">
          Score
        </Text>
        <Text fontSize="sm" fontWeight="semibold">
          {formatNumber(attributes.score ?? 0)}
        </Text>
      </HStack>
      <HStack gap={2}>
        <Text fontSize="sm" color="fg.muted">
          Coins
        </Text>
        <Text fontSize="sm" fontWeight="semibold">
          {formatNumber(attributes.coin ?? 0)}
        </Text>
      </HStack>
    </HStack>
  ) : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => modalSend({ type: "CLOSE" })}
      heading={heading}
      showFooter={showGameFooter}
      footer={footer ?? undefined}
    >
      <UserGameStateContext.Provider value={gameStateValue}>
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
            <Tabs.Root defaultValue="inventory" variant="line" colorPalette="action">
              <Tabs.List>
                <Tabs.Trigger value="inventory">
                  <Icon as={getIcon("package")} />
                  Inventory
                </Tabs.Trigger>
                {pluginTabs.map((entry) => {
                  const TabIcon = entry.icon ? getIcon(entry.icon) : undefined
                  return (
                    <Tabs.Trigger key={entry.id} value={entry.id}>
                      {TabIcon ? <Icon as={TabIcon} /> : null}
                      {entry.label}
                    </Tabs.Trigger>
                  )
                })}
              </Tabs.List>

              <Tabs.Content value="inventory">
                <Stack gap={5} pt={2}>
                  {enabledAttributesForGrid.length > 0 && (
                    <Box>
                      <Heading size="sm" mb={2}>
                        Stats
                      </Heading>
                      <SimpleGrid columns={{ base: 2, sm: 3 }} gap={3}>
                        {enabledAttributesForGrid.map((attr) => (
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
                    </Box>
                  )}

                  {inventoryEnabled && (
                    <InventoryTab
                      items={inventoryItems}
                      maxSlots={maxSlots}
                      definitionMap={definitionMap}
                    />
                  )}
                </Stack>
              </Tabs.Content>

              {pluginTabs.map((entry) => (
                <Tabs.Content key={entry.id} value={entry.id}>
                  <PluginComponentProvider
                    pluginName={entry.pluginName}
                    storeKeys={entry.storeKeys}
                    config={entry.config}
                    components={entry.components}
                  >
                    <VStack align="stretch" gap={3} pt={2}>
                      {entry.tab.children.map((child) => (
                        <PluginComponentRenderer key={child.id} component={child} />
                      ))}
                    </VStack>
                  </PluginComponentProvider>
                </Tabs.Content>
              ))}
            </Tabs.Root>
          )}
        </Stack>
      </UserGameStateContext.Provider>
    </Modal>
  )
}

export default ModalUserGameState

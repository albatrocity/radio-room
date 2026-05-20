import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { HStack, ScrollArea, Spinner, Stack, Tabs, Text } from "@chakra-ui/react"
import type {
  GameAttributeName,
  InventoryItem,
  ItemDefinition,
  StoredArtifactPublic,
} from "@repo/types"
import Modal from "../Modal"
import { emitToSocket, subscribeById, unsubscribeById } from "../../actors/socketActor"
import {
  useIsModalOpen,
  useModalsSend,
  useUserGameStatePayload,
  useUserGameStateLoading,
  useUserGameStateError,
  refreshUserGameState,
  useIsAdmin,
  useAdminListenerSend,
} from "../../hooks/useActors"
import { useGameStateNewPluginTabs } from "../GameStateNewPluginTabsProvider"
import { getIcon } from "../PluginComponents/icons"
import { SvgIcon } from "../ui/svg-icon"
import { UserGameStateContext, type UserGameStateSnapshot } from "./UserGameStateContext"
import {
  GameStateInventoryContent,
  GameStatePluginTabTriggers,
  GameStatePluginTabContents,
} from "./GameState"
import StoredItemsTab from "./GameState/StoredItemsTab"
import AdminListenersTab from "./GameState/AdminListenersTab"
import { UserModifiersList } from "../UserModifiersList"
import ScrollShadowViewport from "../ScrollShadowViewport"

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

const TROPHY_ICON = getIcon("Trophy")
const COINS_ICON = getIcon("Coins")
const PACKAGE_ICON = getIcon("Backpack")
const STORED_ICON = getIcon("Archive")
const EYE_ICON = getIcon("Eye")

const ADMIN_LISTENERS_TAB = "admin"

/** Stable fallbacks — `?? []` / `?? {}` in render create new references every paint and break effect deps / context (see Maximum update depth in studio-bridge preview). */
const EMPTY_INVENTORY_ITEMS: InventoryItem[] = []
const EMPTY_ITEM_DEFINITIONS: ItemDefinition[] = []
const EMPTY_ATTRIBUTES = {} as Record<GameAttributeName, number>

function ModalUserGameState() {
  const modalSend = useModalsSend()
  const isOpen = useIsModalOpen("gameState")
  const isAdmin = useIsAdmin()
  const sendAdminListener = useAdminListenerSend()
  const { pluginTabs, unseenPluginTabIds, markPluginTabViewed } = useGameStateNewPluginTabs()
  const [gameStateTab, setGameStateTab] = useState("inventory")
  const tabScrollRef = useRef<HTMLDivElement>(null)

  const payload = useUserGameStatePayload()
  const loading = useUserGameStateLoading()
  const error = useUserGameStateError()

  useEffect(() => {
    if (isOpen) {
      refreshUserGameState()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && isAdmin && gameStateTab === ADMIN_LISTENERS_TAB) {
      sendAdminListener({ type: "ACTIVATE" })
      return () => {
        sendAdminListener({ type: "DEACTIVATE" })
      }
    }
    sendAdminListener({ type: "DEACTIVATE" })
    return undefined
  }, [isOpen, isAdmin, gameStateTab, sendAdminListener])

  const definitionMap = useMemo(() => {
    const map = new Map<string, ItemDefinition>()
    for (const def of payload?.itemDefinitions ?? EMPTY_ITEM_DEFINITIONS) {
      map.set(def.id, def)
    }
    return map
  }, [payload?.itemDefinitions])

  const enabledAttributes = payload?.session?.config.enabledAttributes ?? []
  const attributes = (payload?.state?.attributes ?? EMPTY_ATTRIBUTES) as Record<
    GameAttributeName,
    number
  >
  const inventoryEnabled = payload?.session?.config.inventoryEnabled ?? false
  /** Empty inventory must not use a fresh `[]` from payload each snapshot (bridge/API often do `?? []`). */
  const rawInventoryItems = payload?.inventory?.items
  const inventoryItems =
    rawInventoryItems && rawInventoryItems.length > 0 ? rawInventoryItems : EMPTY_INVENTORY_ITEMS
  const maxSlots = payload?.inventory?.maxSlots ?? 0

  const [storedArtifacts, setStoredArtifacts] = useState<StoredArtifactPublic[]>([])

  const refreshStoredArtifacts = useCallback(() => {
    const subId = `stored-refresh-${Date.now()}`
    subscribeById(subId, {
      send: (ev: { type: string; data?: { artifacts?: StoredArtifactPublic[] } }) => {
        if (ev.type !== "STORED_ARTIFACTS_RESULT" || !ev.data) return
        setStoredArtifacts(ev.data.artifacts ?? [])
        unsubscribeById(subId)
      },
    })
    emitToSocket("GET_STORED_ARTIFACTS", {})
  }, [])

  useEffect(() => {
    if (!isOpen || !payload?.session) {
      setStoredArtifacts([])
      return
    }
    refreshStoredArtifacts()
  }, [isOpen, payload?.session?.id, inventoryItems, refreshStoredArtifacts])

  const showStoredTab = storedArtifacts.length > 0

  const validTabValues = useMemo(() => {
    const ids = new Set<string>(["inventory"])
    if (showStoredTab) {
      ids.add("stored")
    }
    if (isAdmin) {
      ids.add(ADMIN_LISTENERS_TAB)
    }
    for (const t of pluginTabs) {
      ids.add(t.id)
    }
    return ids
  }, [pluginTabs, showStoredTab, isAdmin])

  useEffect(() => {
    if (!validTabValues.has(gameStateTab)) {
      setGameStateTab("inventory")
    }
  }, [validTabValues, gameStateTab])

  const gameStateValue = useMemo<UserGameStateSnapshot>(() => {
    return {
      session: payload?.session ?? null,
      state: payload?.state ?? null,
      inventory: payload?.inventory ?? null,
      itemDefinitions: payload?.itemDefinitions ?? [],
      currentShopInstance: payload?.currentShopInstance ?? null,
      getAttribute: (attribute: GameAttributeName) => attributes[attribute] ?? 0,
    }
  }, [payload, attributes])

  const showGameFooter = !loading && !error && !!payload?.session

  const footer = showGameFooter ? (
    <Stack gap={3} width="full" borderTopWidth={1} borderColor="border" pt={3}>
      <UserModifiersList modifiers={payload.state?.modifiers ?? []} definitionMap={definitionMap} />
      <HStack justify="space-between" width="full" flexWrap="wrap" gap={4}>
        <HStack gap={2}>
          {TROPHY_ICON ? <SvgIcon icon={TROPHY_ICON} boxSize={4} color="fg.muted" /> : null}
          <Text fontSize="sm" color="fg.muted">
            Score
          </Text>
          <Text fontSize="sm" fontWeight="semibold">
            {formatNumber(attributes.score ?? 0)}
          </Text>
        </HStack>
        <HStack gap={2}>
          {COINS_ICON ? <SvgIcon icon={COINS_ICON} boxSize={4} color="fg.muted" /> : null}
          <Text fontSize="sm" color="fg.muted">
            Coins
          </Text>
          <Text fontSize="sm" fontWeight="semibold">
            {formatNumber(attributes.coin ?? 0)}
          </Text>
        </HStack>
      </HStack>
    </Stack>
  ) : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => modalSend({ type: "CLOSE" })}
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
            <Tabs.Root
              value={gameStateTab}
              onValueChange={(d) => {
                const v = d.value
                setGameStateTab(v)
                if (pluginTabs.some((t) => t.id === v)) {
                  markPluginTabViewed(v)
                }
              }}
              variant="line"
              colorPalette="action"
            >
              <ScrollArea.Root width="full" size="xs">
                <ScrollShadowViewport ref={tabScrollRef} orientation="horizontal">
                  <ScrollArea.Content>
                    <Tabs.List flexWrap="nowrap">
                      <Tabs.Trigger value="inventory" flexWrap="nowrap">
                        {PACKAGE_ICON ? <SvgIcon icon={PACKAGE_ICON} mr={1} /> : null}
                        Inventory
                      </Tabs.Trigger>
                      {showStoredTab ? (
                        <Tabs.Trigger value="stored" whiteSpace="nowrap">
                          {STORED_ICON ? <SvgIcon icon={STORED_ICON} mr={1} /> : null}
                          Stored Items
                        </Tabs.Trigger>
                      ) : null}
                      <GameStatePluginTabTriggers
                        tabs={pluginTabs}
                        unseenTabIds={unseenPluginTabIds}
                      />
                      {isAdmin ? (
                        <Tabs.Trigger value={ADMIN_LISTENERS_TAB} whiteSpace="nowrap">
                          {EYE_ICON ? <SvgIcon icon={EYE_ICON} mr={1} /> : null}
                          Big Brother
                        </Tabs.Trigger>
                      ) : null}
                    </Tabs.List>
                  </ScrollArea.Content>
                </ScrollShadowViewport>
                <ScrollArea.Scrollbar orientation="horizontal" />
              </ScrollArea.Root>

              <Tabs.Content value="inventory">
                <GameStateInventoryContent
                  enabledAttributes={enabledAttributes}
                  attributes={attributes}
                  inventoryEnabled={inventoryEnabled}
                  inventoryItems={inventoryItems}
                  maxSlots={maxSlots}
                  definitionMap={definitionMap}
                />
              </Tabs.Content>

              {showStoredTab ? (
                <Tabs.Content value="stored">
                  <StoredItemsTab artifacts={storedArtifacts} onRefresh={refreshStoredArtifacts} />
                </Tabs.Content>
              ) : null}

              <GameStatePluginTabContents tabs={pluginTabs} />

              {isAdmin ? (
                <Tabs.Content value={ADMIN_LISTENERS_TAB}>
                  <AdminListenersTab />
                </Tabs.Content>
              ) : null}
            </Tabs.Root>
          )}
        </Stack>
      </UserGameStateContext.Provider>
    </Modal>
  )
}

export default ModalUserGameState

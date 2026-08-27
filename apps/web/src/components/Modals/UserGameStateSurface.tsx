import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { HStack, ScrollArea, Spinner, Stack, Status, Tabs, Text } from "@chakra-ui/react"
import type {
  GameAttributeName,
  InventoryItem,
  ItemDefinition,
  StoredArtifactPublic,
} from "@repo/types"
import { getPluginUserState } from "../../lib/getPluginUserState"
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
  useGameStateActiveTab,
  useGameStateDetailFrame,
  useGameStateNavSend,
  useTradesGiftsTabAttention,
  useActiveGameSessionName,
} from "../../hooks/useActors"
import { useActiveIntegratedPanelSlot } from "../../hooks/useIntegratedPanelPresentation"
import { TRADES_GIFTS_TAB } from "../../constants/gameStateTabs"
import { activateTrade, deactivateTrade } from "../../actors/tradeActor"
import { dismissIncomingTradeInviteToasts } from "../../lib/tradeInviteToast"
import { clearTradesGiftsTabAttentionIfEmpty } from "../../lib/tradesGiftsAttention"
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
import TradesGiftsTab from "./GameState/TradesGiftsTab"
import GameStateDetailRouter from "./GameState/GameStateDetailRouter"
import { GameStateDetailBreadcrumb } from "./GameState/GameStateItemDetail"
import { detailFrameTitle, isItemDetailFrame } from "../../types/GameStateDetail"
import { IntegratedPanelShell } from "../IntegratedPanel/IntegratedPanelShell"
import { INTEGRATED_PANEL_SLOTS } from "../../lib/integratedPanelSlots"

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

const TROPHY_ICON = getIcon("Trophy")
const COINS_ICON = getIcon("Coins")
const PACKAGE_ICON = getIcon("Backpack")
const STORED_ICON = getIcon("Archive")
const EYE_ICON = getIcon("Eye")

const TRADES_ICON = getIcon("ArrowLeftRight")

function viewTradesGiftsTab(): void {
  dismissIncomingTradeInviteToasts()
  clearTradesGiftsTabAttentionIfEmpty()
}

const ADMIN_LISTENERS_TAB = "admin"

const EMPTY_INVENTORY_ITEMS: InventoryItem[] = []
const EMPTY_ITEM_DEFINITIONS: ItemDefinition[] = []
const EMPTY_ATTRIBUTES = {} as Record<GameAttributeName, number>

function resolveDefinition(
  frame: { definitionId?: string; shortId: string },
  definitionMap: Map<string, ItemDefinition>,
  definitions: ItemDefinition[],
): ItemDefinition | undefined {
  if (frame.definitionId) {
    const byId = definitionMap.get(frame.definitionId)
    if (byId) return byId
  }
  return definitions.find((d) => d.shortId === frame.shortId)
}

type TabsBodyProps = {
  gameStateTab: string
  setGameStateTab: (v: string) => void
  pluginTabs: ReturnType<typeof useGameStateNewPluginTabs>["pluginTabs"]
  unseenPluginTabIds: ReadonlySet<string>
  markPluginTabViewed: (id: string) => void
  showTradesGiftsTab: boolean
  tradesGiftsUnseen: boolean
  showStoredTab: boolean
  isAdmin: boolean
  enabledAttributes: GameAttributeName[]
  attributes: Record<GameAttributeName, number>
  inventoryEnabled: boolean
  inventoryItems: InventoryItem[]
  maxSlots: number
  maxCollectionSlots: number
  definitionMap: Map<string, ItemDefinition>
  itemDefinitions: ItemDefinition[]
  storedArtifacts: StoredArtifactPublic[]
  refreshStoredArtifacts: () => void
  tabScrollRef: RefObject<HTMLDivElement | null>
}

function GameStateTabsBody({
  gameStateTab,
  setGameStateTab,
  pluginTabs,
  unseenPluginTabIds,
  markPluginTabViewed,
  showTradesGiftsTab,
  tradesGiftsUnseen,
  showStoredTab,
  isAdmin,
  enabledAttributes,
  attributes,
  inventoryEnabled,
  inventoryItems,
  maxSlots,
  maxCollectionSlots,
  definitionMap,
  itemDefinitions,
  storedArtifacts,
  refreshStoredArtifacts,
  tabScrollRef,
}: TabsBodyProps) {
  const sendNav = useGameStateNavSend()
  const currentFrame = useGameStateDetailFrame()

  const tabLabel = useMemo(() => {
    if (gameStateTab === "inventory") return "Inventory"
    if (gameStateTab === TRADES_GIFTS_TAB) return "Trades/Gifts"
    if (gameStateTab === "stored") return "Stored Items"
    if (gameStateTab === ADMIN_LISTENERS_TAB) return "Big Brother"
    return pluginTabs.find((t) => t.id === gameStateTab)?.label ?? "Back"
  }, [gameStateTab, pluginTabs])

  const detailDefinition =
    currentFrame && isItemDetailFrame(currentFrame)
      ? resolveDefinition(currentFrame, definitionMap, itemDefinitions)
      : undefined

  const selectTab = (tabId: string) => {
    setGameStateTab(tabId)
    if (pluginTabs.some((t) => t.id === tabId)) {
      markPluginTabViewed(tabId)
    }
    if (tabId === TRADES_GIFTS_TAB) {
      viewTradesGiftsTab()
    }
  }

  return (
    <Tabs.Root
      value={gameStateTab}
      onValueChange={(d) => selectTab(d.value)}
      variant="line"
      colorPalette="action"
    >
      <ScrollArea.Root width="full" size="xs">
        <ScrollShadowViewport
          ref={tabScrollRef as RefObject<HTMLDivElement>}
          orientation="horizontal"
        >
          <ScrollArea.Content>
            <Tabs.List flexWrap="nowrap">
              <Tabs.Trigger
                value="inventory"
                flexWrap="nowrap"
                onClick={() => selectTab("inventory")}
              >
                {PACKAGE_ICON ? <SvgIcon icon={PACKAGE_ICON} mr={1} /> : null}
                Inventory
              </Tabs.Trigger>
              {showStoredTab ? (
                <Tabs.Trigger
                  value="stored"
                  whiteSpace="nowrap"
                  onClick={() => selectTab("stored")}
                >
                  {STORED_ICON ? <SvgIcon icon={STORED_ICON} mr={1} /> : null}
                  Stored Items
                </Tabs.Trigger>
              ) : null}
              {showTradesGiftsTab ? (
                <Tabs.Trigger
                  value={TRADES_GIFTS_TAB}
                  whiteSpace="nowrap"
                  position="relative"
                  pr={tradesGiftsUnseen ? 2 : undefined}
                  onClick={() => selectTab(TRADES_GIFTS_TAB)}
                >
                  {TRADES_ICON ? <SvgIcon icon={TRADES_ICON} mr={1} /> : null}
                  Trades/Gifts
                  {tradesGiftsUnseen ? (
                    <Status.Root
                      size="sm"
                      colorPalette="primary"
                      position="absolute"
                      top="0"
                      right="0"
                      pointerEvents="none"
                    >
                      <Status.Indicator />
                    </Status.Root>
                  ) : null}
                </Tabs.Trigger>
              ) : null}
              <GameStatePluginTabTriggers
                tabs={pluginTabs}
                unseenTabIds={unseenPluginTabIds}
                onSelect={selectTab}
              />
              {isAdmin ? (
                <Tabs.Trigger
                  value={ADMIN_LISTENERS_TAB}
                  whiteSpace="nowrap"
                  onClick={() => selectTab(ADMIN_LISTENERS_TAB)}
                >
                  {EYE_ICON ? <SvgIcon icon={EYE_ICON} mr={1} /> : null}
                  Big Brother
                </Tabs.Trigger>
              ) : null}
            </Tabs.List>
          </ScrollArea.Content>
        </ScrollShadowViewport>
        <ScrollArea.Scrollbar orientation="horizontal" />
      </ScrollArea.Root>

      {currentFrame ? (
        <Stack gap={4}>
          <GameStateDetailBreadcrumb
            tabLabel={tabLabel}
            detailTitle={detailDefinition?.name ?? (currentFrame ? detailFrameTitle(currentFrame) : "Back")}
            onBack={() => sendNav({ type: "POP_TO_INDEX" })}
          />
          {currentFrame ? (
            <GameStateDetailRouter frame={currentFrame} definition={detailDefinition} />
          ) : null}
        </Stack>
      ) : (
        <>
          <Tabs.Content value="inventory">
            <GameStateInventoryContent
              enabledAttributes={enabledAttributes}
              attributes={attributes}
              inventoryEnabled={inventoryEnabled}
              inventoryItems={inventoryItems}
              maxSlots={maxSlots}
              maxCollectionSlots={maxCollectionSlots}
              definitionMap={definitionMap}
            />
          </Tabs.Content>

          {showStoredTab ? (
            <Tabs.Content value="stored">
              <StoredItemsTab artifacts={storedArtifacts} onRefresh={refreshStoredArtifacts} />
            </Tabs.Content>
          ) : null}

          {showTradesGiftsTab ? (
            <Tabs.Content value={TRADES_GIFTS_TAB}>
              <TradesGiftsTab />
            </Tabs.Content>
          ) : null}

          <GameStatePluginTabContents tabs={pluginTabs} />

          {isAdmin ? (
            <Tabs.Content value={ADMIN_LISTENERS_TAB}>
              <AdminListenersTab />
            </Tabs.Content>
          ) : null}
        </>
      )}
    </Tabs.Root>
  )
}

export type UserGameStateSurfaceVariant = "modal" | "panel"

type SurfaceProps = {
  variant: UserGameStateSurfaceVariant
}

export function UserGameStateSurface({ variant }: SurfaceProps) {
  const modalSend = useModalsSend()
  const isOpen = useIsModalOpen("gameState")
  const activePanelSlot = useActiveIntegratedPanelSlot()
  const sessionName = useActiveGameSessionName()
  const isAdmin = useIsAdmin()
  const sendAdminListener = useAdminListenerSend()
  const { pluginTabs, unseenPluginTabIds, markPluginTabViewed } = useGameStateNewPluginTabs()
  const sendNav = useGameStateNavSend()
  const gameStateTab = useGameStateActiveTab()
  const setGameStateTab = useCallback(
    (tabId: string) => sendNav({ type: "SET_ACTIVE_TAB", tabId }),
    [sendNav],
  )
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
    sendNav({ type: isOpen ? "ACTIVATE" : "DEACTIVATE" })
  }, [isOpen, sendNav])

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
  const rawInventoryItems = payload?.inventory?.items
  const inventoryItems =
    rawInventoryItems && rawInventoryItems.length > 0 ? rawInventoryItems : EMPTY_INVENTORY_ITEMS
  const maxSlots = payload?.inventory?.maxSlots ?? 0
  const maxCollectionSlots = payload?.inventory?.maxCollectionSlots ?? 0

  const [storedArtifacts, setStoredArtifacts] = useState<StoredArtifactPublic[]>([])

  const refreshStoredArtifacts = useCallback(() => {
    const subId = `stored-refresh-${Date.now()}`
    subscribeById(subId, {
      send: (ev: { type: string; data?: { artifacts?: StoredArtifactPublic[] } }) => {
        if (ev.type !== "STORED_ARTIFACTS_RESULT" || !ev.data) return
        setStoredArtifacts(ev.data.artifacts ?? [])
        unsubscribeById(subId)
      },
      eventTypes: ["STORED_ARTIFACTS_RESULT"],
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
  const showTradesGiftsTab = payload?.session?.config.allowTrading === true
  const tradesGiftsUnseen = useTradesGiftsTabAttention()

  useEffect(() => {
    if (isOpen && showTradesGiftsTab) {
      activateTrade(payload?.activeTrade ?? null)
      return () => deactivateTrade()
    }
    deactivateTrade()
    return undefined
  }, [isOpen, showTradesGiftsTab, payload?.activeTrade?.tradeId])

  const validTabValues = useMemo(() => {
    const ids = new Set<string>(["inventory"])
    if (showStoredTab) {
      ids.add("stored")
    }
    if (showTradesGiftsTab || gameStateTab === TRADES_GIFTS_TAB) {
      ids.add(TRADES_GIFTS_TAB)
    }
    if (isAdmin) {
      ids.add(ADMIN_LISTENERS_TAB)
    }
    for (const t of pluginTabs) {
      ids.add(t.id)
    }
    return ids
  }, [pluginTabs, showStoredTab, showTradesGiftsTab, isAdmin, gameStateTab])

  useEffect(() => {
    if (!validTabValues.has(gameStateTab)) {
      setGameStateTab("inventory")
    }
  }, [validTabValues, gameStateTab])

  const isPluginTabActive = pluginTabs.some((t) => t.id === gameStateTab)
  useEffect(() => {
    if (isOpen && isPluginTabActive) {
      markPluginTabViewed(gameStateTab)
    }
  }, [isOpen, gameStateTab, isPluginTabActive, payload, markPluginTabViewed])

  useEffect(() => {
    if (isOpen && gameStateTab === TRADES_GIFTS_TAB) {
      viewTradesGiftsTab()
    }
  }, [isOpen, gameStateTab, payload])

  const gameStateValue = useMemo<UserGameStateSnapshot>(() => {
    const pluginUserState = payload?.pluginUserState ?? {}
    return {
      session: payload?.session ?? null,
      state: payload?.state ?? null,
      inventory: payload?.inventory ?? null,
      itemDefinitions: payload?.itemDefinitions ?? [],
      pendingGifts: payload?.pendingGifts,
      pendingTradeInvites: payload?.pendingTradeInvites,
      activeTrade: payload?.activeTrade ?? null,
      getPluginState: <T extends Record<string, unknown>>(pluginName: string) =>
        getPluginUserState<T>(pluginUserState, pluginName),
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

  const body = (
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
          <GameStateTabsBody
            gameStateTab={gameStateTab}
            setGameStateTab={setGameStateTab}
            pluginTabs={pluginTabs}
            unseenPluginTabIds={unseenPluginTabIds}
            markPluginTabViewed={markPluginTabViewed}
            showTradesGiftsTab={showTradesGiftsTab}
            tradesGiftsUnseen={tradesGiftsUnseen}
            showStoredTab={showStoredTab}
            isAdmin={isAdmin}
            enabledAttributes={enabledAttributes}
            attributes={attributes}
            inventoryEnabled={inventoryEnabled}
            inventoryItems={inventoryItems}
            maxSlots={maxSlots}
            maxCollectionSlots={maxCollectionSlots}
            definitionMap={definitionMap}
            itemDefinitions={payload?.itemDefinitions ?? EMPTY_ITEM_DEFINITIONS}
            storedArtifacts={storedArtifacts}
            refreshStoredArtifacts={refreshStoredArtifacts}
            tabScrollRef={tabScrollRef}
          />
        )}
      </Stack>
    </UserGameStateContext.Provider>
  )

  if (!isOpen) return null

  if (variant === "panel") {
    if (activePanelSlot !== "gameState") return null

    const title = sessionName
      ? `${INTEGRATED_PANEL_SLOTS.gameState.title} — ${sessionName}`
      : INTEGRATED_PANEL_SLOTS.gameState.title

    return (
      <IntegratedPanelShell
        title={title}
        onClose={() => modalSend({ type: "CLOSE" })}
        footer={showGameFooter ? footer : undefined}
      >
        {body}
      </IntegratedPanelShell>
    )
  }

  if (activePanelSlot === "gameState") return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => modalSend({ type: "CLOSE" })}
      showFooter={showGameFooter}
      footer={footer ?? undefined}
      placement="top"
      contentProps={{
        mt: { base: 3, md: 8 },
        mb: 3,
        minH: { base: "min(70dvh, 36rem)", md: "32rem" },
        maxH: "90dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      bodyProps={{
        flex: "1",
        minH: 0,
        overflowY: "auto",
      }}
    >
      {body}
    </Modal>
  )
}

export default UserGameStateSurface

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react"
import { Box, HStack, ScrollArea, Spinner, Stack, Status, Tabs, Text } from "@chakra-ui/react"
import type { GameAttributeName, ItemDefinition } from "@repo/types"
import { getPluginUserState } from "../../lib/getPluginUserState"
import Drawer from "../Drawer"
import {
  useIsModalOpen,
  useModalsSend,
  useUserGameStatePayload,
  useUserGameStateLoading,
  useUserGameStateError,
  useStoredArtifacts,
  useIsAdmin,
  useGameStateActiveTab,
  useGameStateDetailFrame,
  useGameStateNavSend,
  useTradesGiftsTabAttention,
} from "../../hooks/useActors"
import { useActiveIntegratedPanelSlot } from "../../hooks/useIntegratedPanelPresentation"
import { ADMIN_LISTENERS_TAB, STORED_ITEMS_TAB, TRADES_GIFTS_TAB } from "../../constants/gameStateTabs"
import { useGameStateNewPluginTabs } from "../GameStateNewPluginTabsProvider"
import { getIcon } from "../PluginComponents/icons"
import { SvgIcon } from "../ui/svg-icon"
import { UserGameStateContext, useUserGameState, type UserGameStateSnapshot } from "./UserGameStateContext"
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
import {
  TradeDetailActions,
  TradeDetailComposer,
  TradeDetailInventoryPicker,
} from "./GameState/TradeDetailPanel"
import {
  detailFrameTitle,
  isItemDetailFrame,
  isTradeDetailFrame,
} from "../../types/GameStateDetail"
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
  showTradesGiftsTab: boolean
  tradesGiftsUnseen: boolean
  showStoredTab: boolean
  isAdmin: boolean
  tabScrollRef: RefObject<HTMLDivElement | null>
  /** Explicit height chain for the lg+ integrated panel (not the modal drawer). */
  fillHeight?: boolean
}

function GameStateTabsBody({
  gameStateTab,
  setGameStateTab,
  pluginTabs,
  unseenPluginTabIds,
  showTradesGiftsTab,
  tradesGiftsUnseen,
  showStoredTab,
  isAdmin,
  tabScrollRef,
  fillHeight = false,
}: TabsBodyProps) {
  const sendNav = useGameStateNavSend()
  const currentFrame = useGameStateDetailFrame()
  const gameState = useUserGameState()
  const itemDefinitions = gameState?.itemDefinitions ?? EMPTY_ITEM_DEFINITIONS
  const definitionMap = useMemo(() => {
    const map = new Map<string, ItemDefinition>()
    for (const def of itemDefinitions) {
      map.set(def.id, def)
    }
    return map
  }, [itemDefinitions])

  const tabLabel = useMemo(() => {
    if (gameStateTab === "inventory") return "Inventory"
    if (gameStateTab === TRADES_GIFTS_TAB) return "Trades/Gifts"
    if (gameStateTab === STORED_ITEMS_TAB) return "Stored Items"
    if (gameStateTab === ADMIN_LISTENERS_TAB) return "Big Brother"
    return pluginTabs.find((t) => t.id === gameStateTab)?.label ?? "Back"
  }, [gameStateTab, pluginTabs])

  const detailDefinition =
    currentFrame && isItemDetailFrame(currentFrame)
      ? resolveDefinition(currentFrame, definitionMap, itemDefinitions)
      : undefined

  const selectTab = (tabId: string) => {
    setGameStateTab(tabId)
  }

  const tabContents = (
    <>
      <Tabs.Content value="inventory">
        <GameStateInventoryContent />
      </Tabs.Content>

      {showStoredTab ? (
        <Tabs.Content value={STORED_ITEMS_TAB}>
          <StoredItemsTab />
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
  )

  return (
    <Tabs.Root
      value={gameStateTab}
      onValueChange={(d) => selectTab(d.value)}
      variant="line"
      colorPalette="action"
      {...(fillHeight ? { flex: "1", minH: 0, h: "full" } : {})}
    >
      <Box
        {...(fillHeight
          ? {
              flex: "1",
              h: "full",
              minH: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }
          : {})}
      >
        <Box flexShrink={0}>
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
                    gap={1}
                    onClick={() => selectTab("inventory")}
                  >
                    {PACKAGE_ICON ? <SvgIcon icon={PACKAGE_ICON} boxSize="1em" /> : null}
                    Inventory
                  </Tabs.Trigger>
                  {showStoredTab ? (
                    <Tabs.Trigger
                      value={STORED_ITEMS_TAB}
                      whiteSpace="nowrap"
                      gap={1}
                      onClick={() => selectTab(STORED_ITEMS_TAB)}
                    >
                      {STORED_ICON ? <SvgIcon icon={STORED_ICON} boxSize="1em" /> : null}
                      Stored Items
                    </Tabs.Trigger>
                  ) : null}
                  {showTradesGiftsTab ? (
                    <Tabs.Trigger
                      value={TRADES_GIFTS_TAB}
                      whiteSpace="nowrap"
                      position="relative"
                      gap={1}
                      pr={tradesGiftsUnseen ? 2 : undefined}
                      onClick={() => selectTab(TRADES_GIFTS_TAB)}
                    >
                      {TRADES_ICON ? <SvgIcon icon={TRADES_ICON} boxSize="1em" /> : null}
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
                      gap={1}
                      onClick={() => selectTab(ADMIN_LISTENERS_TAB)}
                    >
                      {EYE_ICON ? <SvgIcon icon={EYE_ICON} boxSize="1em" /> : null}
                      Big Brother
                    </Tabs.Trigger>
                  ) : null}
                </Tabs.List>
              </ScrollArea.Content>
            </ScrollShadowViewport>
            <ScrollArea.Scrollbar orientation="horizontal" />
          </ScrollArea.Root>
        </Box>

        {currentFrame ? (
          <Stack gap={4} {...(fillHeight ? { flex: "1", minH: 0, overflow: "hidden" } : {})}>
            <GameStateDetailBreadcrumb
              tabLabel={tabLabel}
              detailTitle={
                detailDefinition?.name ?? (currentFrame ? detailFrameTitle(currentFrame) : "Back")
              }
              onBack={() => sendNav({ type: "POP_TO_INDEX" })}
            />
            <Box
              {...(fillHeight
                ? {
                    flex: "1",
                    minH: 0,
                    display: "flex",
                    flexDirection: "column",
                    overflowY: "auto",
                  }
                : {})}
            >
              <GameStateDetailRouter
                frame={currentFrame}
                definition={detailDefinition}
                fillHeight={fillHeight}
              />
            </Box>
          </Stack>
        ) : fillHeight ? (
          <Box flex="1" minH={0} overflowY="auto">
            {tabContents}
          </Box>
        ) : (
          tabContents
        )}
      </Box>
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
  const isAdmin = useIsAdmin()
  const { pluginTabs, unseenPluginTabIds } = useGameStateNewPluginTabs()
  const sendNav = useGameStateNavSend()
  const gameStateTab = useGameStateActiveTab()
  const currentFrame = useGameStateDetailFrame()
  const setGameStateTab = useCallback(
    (tabId: string) => sendNav({ type: "SET_ACTIVE_TAB", tabId }),
    [sendNav],
  )
  const tabScrollRef = useRef<HTMLDivElement>(null)

  const payload = useUserGameStatePayload()
  const loading = useUserGameStateLoading()
  const error = useUserGameStateError()
  const storedArtifacts = useStoredArtifacts()

  const definitionMap = useMemo(() => {
    const map = new Map<string, ItemDefinition>()
    for (const def of payload?.itemDefinitions ?? EMPTY_ITEM_DEFINITIONS) {
      map.set(def.id, def)
    }
    return map
  }, [payload?.itemDefinitions])

  const attributes = (payload?.state?.attributes ?? EMPTY_ATTRIBUTES) as Record<
    GameAttributeName,
    number
  >

  const showStoredTab = storedArtifacts.length > 0
  const showTradesGiftsTab = payload?.session?.config.allowTrading === true
  const tradesGiftsUnseen = useTradesGiftsTabAttention()

  const availableTabIds = useMemo(() => {
    const ids = new Set<string>(["inventory"])
    if (showStoredTab) {
      ids.add(STORED_ITEMS_TAB)
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
    return [...ids]
  }, [pluginTabs, showStoredTab, showTradesGiftsTab, isAdmin, gameStateTab])

  useEffect(() => {
    // Plugin tab ids live in this tree; invalid-tab snap is on SET_AVAILABLE_TABS.
    sendNav({ type: "SET_AVAILABLE_TABS", tabIds: availableTabIds })
  }, [availableTabIds, sendNav])

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
  const tradeChrome =
    currentFrame && isTradeDetailFrame(currentFrame) ? (
      <Stack gap={2}>
        <TradeDetailInventoryPicker tradeId={currentFrame.tradeId} />
        <TradeDetailComposer tradeId={currentFrame.tradeId} />
        <TradeDetailActions tradeId={currentFrame.tradeId} />
      </Stack>
    ) : null

  const footer = showGameFooter ? (
    <Stack gap={0} width="full" bg="bg.muted" borderTopWidth={1} borderColor="border" px={3} py={3}>
      {tradeChrome}
      <Stack
        gap={3}
        width="full"
        {...(tradeChrome ? { borderTopWidth: 1, borderColor: "border", pt: 3, mt: 3 } : {})}
      >
        <UserModifiersList
          modifiers={payload.state?.modifiers ?? []}
          definitionMap={definitionMap}
        />
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
    </Stack>
  ) : null

  const fillHeight = variant === "panel"

  const body = (
    <UserGameStateContext.Provider value={gameStateValue}>
      <Stack gap={5} {...(fillHeight ? { flex: "1", minH: 0, h: "full", overflow: "hidden" } : {})}>
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
            showTradesGiftsTab={showTradesGiftsTab}
            tradesGiftsUnseen={tradesGiftsUnseen}
            showStoredTab={showStoredTab}
            isAdmin={isAdmin}
            tabScrollRef={tabScrollRef}
            fillHeight={fillHeight}
          />
        )}
      </Stack>
    </UserGameStateContext.Provider>
  )

  if (!isOpen) return null

  if (variant === "panel") {
    if (activePanelSlot !== "gameState") return null

    return (
      <IntegratedPanelShell
        title={INTEGRATED_PANEL_SLOTS.gameState.title}
        onClose={() => modalSend({ type: "CLOSE" })}
        footer={showGameFooter ? footer : undefined}
        fill
      >
        {body}
      </IntegratedPanelShell>
    )
  }

  if (activePanelSlot === "gameState") return null

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => modalSend({ type: "CLOSE" })}
      placement="bottom"
      size="full"
      heading={INTEGRATED_PANEL_SLOTS.gameState.title}
      footer={showGameFooter ? footer ?? undefined : undefined}
      footerFlush
    >
      {body}
    </Drawer>
  )
}

export default UserGameStateSurface

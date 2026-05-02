import { useEffect, useMemo, useState } from "react"
import { HStack, Icon, Spinner, Stack, Tabs, Text } from "@chakra-ui/react"
import type { GameAttributeName, ItemDefinition } from "@repo/types"
import Modal from "../Modal"
import {
  useIsModalOpen,
  useModalsSend,
  useUserGameStatePayload,
  useUserGameStateLoading,
  useUserGameStateError,
  refreshUserGameState,
} from "../../hooks/useActors"
import { useGameStateNewPluginTabs } from "../GameStateNewPluginTabsProvider"
import { getIcon } from "../PluginComponents/icons"
import { UserGameStateContext, type UserGameStateSnapshot } from "./UserGameStateContext"
import {
  GameStateInventoryContent,
  GameStatePluginTabTriggers,
  GameStatePluginTabContents,
} from "./GameState"
import { UserModifiersList } from "../UserModifiersList"

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

function ModalUserGameState() {
  const modalSend = useModalsSend()
  const isOpen = useIsModalOpen("gameState")
  const { pluginTabs, unseenPluginTabIds, markPluginTabViewed } = useGameStateNewPluginTabs()
  const [gameStateTab, setGameStateTab] = useState("inventory")

  const payload = useUserGameStatePayload()
  const loading = useUserGameStateLoading()
  const error = useUserGameStateError()

  useEffect(() => {
    if (isOpen) {
      refreshUserGameState()
    }
  }, [isOpen])

  const definitionMap = useMemo(() => {
    const map = new Map<string, ItemDefinition>()
    for (const def of payload?.itemDefinitions ?? []) {
      map.set(def.id, def)
    }
    return map
  }, [payload?.itemDefinitions])

  const enabledAttributes = payload?.session?.config.enabledAttributes ?? []
  const attributes = (payload?.state?.attributes ?? {}) as Record<GameAttributeName, number>
  const inventoryEnabled = payload?.session?.config.inventoryEnabled ?? false
  const inventoryItems = payload?.inventory?.items ?? []
  const maxSlots = payload?.inventory?.maxSlots ?? 0

  const validTabValues = useMemo(() => {
    const ids = new Set<string>(["inventory"])
    for (const t of pluginTabs) {
      ids.add(t.id)
    }
    return ids
  }, [pluginTabs])

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
      getAttribute: (attribute: GameAttributeName) => attributes[attribute] ?? 0,
    }
  }, [payload, attributes])

  const showGameFooter = !loading && !error && !!payload?.session

  const footer = showGameFooter ? (
    <Stack gap={3} width="full">
      <UserModifiersList modifiers={payload.state?.modifiers ?? []} definitionMap={definitionMap} />
      <HStack justify="space-between" width="full" flexWrap="wrap" gap={4}>
        <HStack gap={2}>
          <Icon as={getIcon("trophy")} boxSize={4} color="fg.muted" />
          <Text fontSize="sm" color="fg.muted">
            Score
          </Text>
          <Text fontSize="sm" fontWeight="semibold">
            {formatNumber(attributes.score ?? 0)}
          </Text>
        </HStack>
        <HStack gap={2}>
          <Icon as={getIcon("coins")} boxSize={4} color="fg.muted" />
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
              <Tabs.List>
                <Tabs.Trigger value="inventory">
                  <Icon as={getIcon("package")} />
                  Inventory
                </Tabs.Trigger>
                <GameStatePluginTabTriggers tabs={pluginTabs} unseenTabIds={unseenPluginTabIds} />
              </Tabs.List>

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

              <GameStatePluginTabContents tabs={pluginTabs} />
            </Tabs.Root>
          )}
        </Stack>
      </UserGameStateContext.Provider>
    </Modal>
  )
}

export default ModalUserGameState

import { useEffect, useMemo } from "react"
import { HStack, Heading, Icon, Spinner, Stack, Tabs, Text } from "@chakra-ui/react"
import type { GameAttributeName, ItemDefinition, PluginTabComponent } from "@repo/types"
import { checkShowWhenConditions } from "@repo/utils"
import Modal from "../Modal"
import {
  useIsModalOpen,
  useModalsSend,
  usePluginConfigs,
  useUserGameStatePayload,
  useUserGameStateLoading,
  useUserGameStateError,
  refreshUserGameState,
} from "../../hooks/useActors"
import { usePluginSchemas } from "../../hooks/usePluginSchemas"
import { getIcon } from "../PluginComponents/icons"
import { UserGameStateContext, type UserGameStateSnapshot } from "./UserGameStateContext"
import {
  GameStateInventoryContent,
  GameStatePluginTabTriggers,
  GameStatePluginTabContents,
  type PluginTabEntry,
} from "./GameState"

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

function ModalUserGameState() {
  const modalSend = useModalsSend()
  const isOpen = useIsModalOpen("gameState")
  const { schemas } = usePluginSchemas()
  const pluginConfigs = usePluginConfigs() || {}

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

  const pluginTabs = useMemo<PluginTabEntry[]>(() => {
    const result: PluginTabEntry[] = []
    for (const schema of schemas) {
      const components = schema.componentSchema?.components ?? []
      const tabs = components.filter(
        (c): c is PluginTabComponent => c.type === "tab" && c.area === "gameStateTab",
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
      {payload?.session && <Heading size="lg">{payload.session.config.name}</Heading>}
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

  const showGameFooter = !loading && !error && !!payload?.session

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
                <GameStatePluginTabTriggers tabs={pluginTabs} />
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

import { useMemo, useRef, useState } from "react"
import { Badge, Box, Button, HStack, ScrollArea, Stack, Text, VStack } from "@chakra-ui/react"
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual"
import type { ItemDefinition } from "@repo/types"
import {
  artifactKindBadge,
  artifactSummaryLabel,
  computeFreeSlotsByPool,
  emptyStashLine,
  readArtifactContents,
} from "@repo/game-logic"
import { clearStashPick, refreshStoredArtifacts } from "../../../actors/userGameStateActor"
import { STORAGE_TAB } from "../../../constants/gameStateTabs"
import {
  useGameStateActiveTab,
  usePendingPickArtifactId,
  useStoredArtifacts,
} from "../../../hooks/useActors"
import { virtualizerOverscan } from "../../../lib/virtualizerOverscan"
import ScrollShadowViewport from "../../ScrollShadowViewport"
import VirtualizerContent, { virtualizerViewportCss } from "../../VirtualizerContent"
import { useUserGameState } from "../UserGameStateContext"
import { DepositStashDialog } from "./DepositStashDialog"
import { RetrieveStashDialog } from "./RetrieveStashDialog"
import { containerDisplayName, formatStashLastTouched } from "./stashUi"

const ROW_ESTIMATE_PX = 104
/** Cap when the Game surface is not filling leftover drawer/panel height. */
const LIST_MAX_H = "min(60vh, 28rem)"

/** Hidden tab panels report 0px; recording that collapses the virtual list. */
function measureVisibleRowHeight(
  element: Element,
  entry: ResizeObserverEntry | undefined,
  instance: Virtualizer<Element, Element>,
): number {
  const box = entry?.borderBoxSize?.[0]?.blockSize
  const size = Math.round(box && box > 0 ? box : element.getBoundingClientRect().height)
  if (size > 0) return size
  const index = instance.indexFromElement(element)
  return instance.itemSizeCache.get(instance.options.getItemKey(index)) ?? ROW_ESTIMATE_PX
}

export default function StorageTab({ fillHeight = false }: { fillHeight?: boolean }) {
  const artifacts = useStoredArtifacts()
  const isActive = useGameStateActiveTab() === STORAGE_TAB
  const pendingPickId = usePendingPickArtifactId()
  const gameState = useUserGameState()
  const [retrieveForId, setRetrieveForId] = useState<string | null>(null)
  const [depositForId, setDepositForId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const activeRetrieveId = retrieveForId ?? pendingPickId

  const inventory = gameState?.inventory
  const definitionMap = gameState?.definitionMap ?? new Map<string, ItemDefinition>()
  const definitionsById = useMemo(() => {
    const rec: Record<string, ItemDefinition | undefined> = {}
    for (const [id, def] of definitionMap) rec[id] = def
    return rec
  }, [definitionMap])

  const retrieveArtifact = artifacts.find((a) => a.id === activeRetrieveId) ?? null
  const depositArtifact = artifacts.find((a) => a.id === depositForId) ?? null
  const pickGranted = activeRetrieveId != null && activeRetrieveId === pendingPickId

  const freeSlots = inventory
    ? computeFreeSlotsByPool(inventory.items, inventory, definitionsById)
    : { inventory: 0, collection: 0, playback: 0 }

  const closeRetrieve = () => {
    setRetrieveForId(null)
    clearStashPick()
  }

  const afterRetrieve = () => {
    refreshStoredArtifacts()
    closeRetrieve()
  }
  const afterDeposit = () => {
    refreshStoredArtifacts()
    setDepositForId(null)
  }

  const virtualizer = useVirtualizer({
    count: artifacts.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: virtualizerOverscan(6, 12),
    getItemKey: (index) => artifacts[index]?.id ?? index,
    enabled: isActive && artifacts.length > 0,
    measureElement: measureVisibleRowHeight,
  })

  if (artifacts.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted">
        Nothing in storage right now.
      </Text>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <>
      <Stack
        gap={2}
        {...(fillHeight ? { flex: "1", minH: 0, h: "full", overflow: "hidden" } : {})}
      >
        <Text fontSize="sm" color="fg.muted" flexShrink={0}>
          Password-protected containers to store items in. Accessible during and across shows.
          Anyone can access these with the right password.
        </Text>
        <ScrollArea.Root
          size="sm"
          variant="hover"
          w="100%"
          {...(fillHeight ? { flex: "1 1 auto", minH: 0, height: "100%" } : { maxH: LIST_MAX_H })}
        >
          <ScrollShadowViewport
            ref={scrollRef}
            {...(fillHeight ? { height: "100%" } : { maxH: LIST_MAX_H })}
            css={virtualizerViewportCss}
          >
            <ScrollArea.Content>
              <VirtualizerContent totalSize={virtualizer.getTotalSize()}>
                {virtualItems.map((virtualRow) => {
                  const a = artifacts[virtualRow.index]
                  if (!a) return null
                  const contents = readArtifactContents(a)
                  const isEmpty = contents.length === 0
                  const summary = isEmpty
                    ? emptyStashLine(containerDisplayName(a, definitionMap))
                    : artifactSummaryLabel(contents)
                  const title = a.label?.trim() || (isEmpty ? "Empty" : summary)
                  const grantExpiresAt = a.accessGrantExpiresAt ?? 0
                  const grantActive = grantExpiresAt > Date.now()
                  const grantMinsLeft = grantActive
                    ? Math.max(1, Math.ceil((grantExpiresAt - Date.now()) / 60_000))
                    : 0
                  return (
                    <Box
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      position="absolute"
                      top={0}
                      left={0}
                      width="100%"
                      transform={`translateY(${virtualRow.start}px)`}
                      pb={2}
                    >
                      <Stack
                        gap={3}
                        borderWidth="1px"
                        borderColor="border.muted"
                        borderRadius="md"
                        p={3}
                        align="stretch"
                        justify="stretch"
                        flexWrap="wrap"
                        direction={["column", "row"]}
                      >
                        <VStack align="start" gap={0} flex="1" minW={0}>
                          <HStack gap={2} flexWrap="wrap">
                            <Text fontSize="lg" fontWeight="semibold">
                              {title}
                            </Text>
                            <Badge size="sm" variant="outline">
                              {artifactKindBadge(contents)}
                            </Badge>
                          </HStack>
                          {a.label?.trim() || isEmpty ? (
                            <Text fontSize="xs" color="fg.muted">
                              {summary}
                            </Text>
                          ) : null}
                          <Text fontSize="xs" color="fg.muted">
                            Stored by {a.storedByUsername} · Last opened {formatStashLastTouched(a)}
                          </Text>
                        </VStack>
                        <Stack gap={1} direction={["row", "column"]}>
                          <Button
                            flex={[1, "auto"]}
                            size={["md", "sm"]}
                            variant="outline"
                            onClick={() => setDepositForId(a.id)}
                          >
                            Add
                          </Button>
                          <Stack gap={0} flex={1}>
                            <Button
                              flex={[1, "auto"]}
                              size={["md", "sm"]}
                              variant="solid"
                              colorPalette="action"
                              onClick={() => setRetrieveForId(a.id)}
                            >
                              {grantActive
                                ? "Open (picked)"
                                : isEmpty
                                ? "Move to inventory"
                                : "Retrieve"}
                            </Button>
                            {grantActive ? (
                              <Text fontSize="xs" color="fg.muted" textAlign="center">
                                {grantMinsLeft} min left
                              </Text>
                            ) : null}
                          </Stack>
                        </Stack>
                      </Stack>
                    </Box>
                  )
                })}
              </VirtualizerContent>
            </ScrollArea.Content>
          </ScrollShadowViewport>
          <ScrollArea.Scrollbar>
            <ScrollArea.Thumb />
          </ScrollArea.Scrollbar>
          <ScrollArea.Corner />
        </ScrollArea.Root>
      </Stack>

      <RetrieveStashDialog
        key={activeRetrieveId ?? "retrieve-closed"}
        artifact={retrieveArtifact}
        pickGranted={pickGranted}
        freeSlots={freeSlots}
        definitionsById={definitionsById}
        definitionMap={definitionMap}
        onClose={closeRetrieve}
        onSuccess={afterRetrieve}
      />
      <DepositStashDialog
        key={depositForId ?? "deposit-closed"}
        artifact={depositArtifact}
        inventoryItems={inventory?.items ?? []}
        definitionMap={definitionMap}
        coinBalance={Math.max(0, Math.floor(gameState?.state?.attributes?.coin ?? 0))}
        onClose={() => setDepositForId(null)}
        onSuccess={afterDeposit}
      />
    </>
  )
}

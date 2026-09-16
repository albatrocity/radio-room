import { useMemo, useState } from "react"
import { Badge, Button, HStack, Stack, Text, VStack } from "@chakra-ui/react"
import type { ItemDefinition, StoredArtifactPublic } from "@repo/types"
import {
  artifactKindBadge,
  artifactSummaryLabel,
  computeFreeSlotsByPool,
  emptyStashLine,
  readArtifactContents,
} from "@repo/game-logic"
import { refreshStoredArtifacts } from "../../../actors/userGameStateActor"
import { useStoredArtifacts } from "../../../hooks/useActors"
import { useUserGameState } from "../UserGameStateContext"
import { DepositStashDialog } from "./DepositStashDialog"
import { RetrieveStashDialog } from "./RetrieveStashDialog"
import { containerDisplayName, formatStashWhen } from "./stashUi"

export default function StorageTab() {
  const artifacts = useStoredArtifacts()
  const gameState = useUserGameState()
  const [retrieveForId, setRetrieveForId] = useState<string | null>(null)
  const [depositForId, setDepositForId] = useState<string | null>(null)

  const inventory = gameState?.inventory
  const definitionMap = gameState?.definitionMap ?? new Map<string, ItemDefinition>()
  const definitionsById = useMemo(() => {
    const rec: Record<string, ItemDefinition | undefined> = {}
    for (const [id, def] of definitionMap) rec[id] = def
    return rec
  }, [definitionMap])

  const retrieveArtifact = artifacts.find((a) => a.id === retrieveForId) ?? null
  const depositArtifact = artifacts.find((a) => a.id === depositForId) ?? null

  const freeSlots = inventory
    ? computeFreeSlotsByPool(inventory.items, inventory, definitionsById)
    : { inventory: 0, collection: 0, playback: 0 }

  const afterRetrieve = () => {
    refreshStoredArtifacts()
    setRetrieveForId(null)
  }
  const afterDeposit = () => {
    refreshStoredArtifacts()
    setDepositForId(null)
  }

  if (artifacts.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted">
        Nothing in storage right now.
      </Text>
    )
  }

  return (
    <>
      <Stack gap={2}>
        <Text fontSize="sm" color="fg.muted">
          Password-protected containers to store items in. Accessible during and across shows.
          Anyone can access these with the right password.
        </Text>
        {artifacts.map((a: StoredArtifactPublic) => {
          const contents = readArtifactContents(a)
          const isEmpty = contents.length === 0
          const summary = isEmpty
            ? emptyStashLine(containerDisplayName(a, definitionMap))
            : artifactSummaryLabel(contents)
          const title = a.label?.trim() || (isEmpty ? "Empty" : summary)
          return (
            <Stack
              key={a.id}
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
                  Stored by {a.storedByUsername} · {formatStashWhen(a.storedAt)}
                </Text>
              </VStack>
              <Stack gap={1} direction={["row", "column"]}>
                <Button flex={1} variant="outline" onClick={() => setDepositForId(a.id)}>
                  Add
                </Button>
                <Button
                  flex={1}
                  variant="solid"
                  colorPalette="action"
                  onClick={() => setRetrieveForId(a.id)}
                >
                  {isEmpty ? "Move to inventory" : "Retrieve"}
                </Button>
              </Stack>
            </Stack>
          )
        })}
      </Stack>

      <RetrieveStashDialog
        key={retrieveForId ?? "retrieve-closed"}
        artifact={retrieveArtifact}
        freeSlots={freeSlots}
        definitionsById={definitionsById}
        definitionMap={definitionMap}
        onClose={() => setRetrieveForId(null)}
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

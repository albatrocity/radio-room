import { useMemo, useState } from "react"
import {
  Badge,
  Button,
  Checkbox,
  CloseButton,
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPositioner,
  DialogRoot,
  DialogTitle,
  HStack,
  Input,
  Portal,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import type { ArtifactContent, InventoryItem, StoredArtifactPublic } from "@repo/types"
import { isStorageContainerDefinition, resolveSlotPool } from "@repo/types"
import {
  artifactSummaryLabel,
  computeFreeSlotsByPool,
  planWithdrawal,
  readArtifactContents,
  readStorageCapacity,
  remainingStashSlots,
  selectFittingContentIds,
} from "@repo/game-logic"
import { emitToSocket } from "../../../actors/socketActor"
import { refreshStoredArtifacts } from "../../../actors/userGameStateActor"
import { useStoredArtifacts } from "../../../hooks/useActors"
import { useSocketResultHandle } from "../../../lib/subscribeForSocketResult"
import { toaster } from "../../ui/toaster"
import { useUserGameState } from "../UserGameStateContext"

function formatWhen(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms))
  } catch {
    return String(ms)
  }
}

function contentLine(c: ArtifactContent): string {
  if (c.kind === "coin") return `${c.coinValue.toLocaleString()} coins`
  return c.itemQuantity > 1 ? `${c.itemName} ×${c.itemQuantity}` : c.itemName
}

function isCoinStash(contents: ArtifactContent[]): boolean {
  return contents.length > 0 && contents.every((c) => c.kind === "coin")
}

function kindBadge(contents: ArtifactContent[]): string {
  const hasCoin = contents.some((c) => c.kind === "coin")
  const hasItem = contents.some((c) => c.kind === "item")
  if (hasCoin && hasItem) return "Mixed"
  if (hasCoin) return "Coins"
  if (hasItem) return "Item"
  return "Empty"
}

/** `containerName` is hydrated at list time; Game State rarely has the definition. */
function containerDisplayName(
  a: StoredArtifactPublic | undefined,
  definitionMap: Map<string, { name?: string }>,
): string | undefined {
  if (!a) return undefined
  const hydrated = a.containerName?.trim()
  if (hydrated) return hydrated
  const def = a.containerDefinitionId ? definitionMap.get(a.containerDefinitionId) : undefined
  return def?.name?.trim() || undefined
}

function emptyStashLine(containerName: string | undefined): string {
  return containerName ? `${containerName} is empty.` : "This stash is empty."
}

export default function StoredItemsTab() {
  const artifacts = useStoredArtifacts()
  const gameState = useUserGameState()
  const { subscribe } = useSocketResultHandle()
  const [retrieveForId, setRetrieveForId] = useState<string | null>(null)
  const [depositForId, setDepositForId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [password, setPassword] = useState("")
  const [depositPassword, setDepositPassword] = useState("")
  const [pickedDepositIds, setPickedDepositIds] = useState<string[]>([])
  const [coinAmountStr, setCoinAmountStr] = useState("")

  const inventory = gameState?.inventory
  const definitionMap = gameState?.definitionMap ?? new Map()
  const definitionsById = useMemo(() => {
    const rec: Record<
      string,
      (typeof definitionMap extends Map<string, infer V> ? V : never) | undefined
    > = {}
    for (const [id, def] of definitionMap) rec[id] = def
    return rec
  }, [definitionMap])

  const retrieveArtifact = artifacts.find((a) => a.id === retrieveForId)
  const retrieveContents = retrieveArtifact ? readArtifactContents(retrieveArtifact) : []
  const depositArtifact = artifacts.find((a) => a.id === depositForId)
  const depositContents = depositArtifact ? readArtifactContents(depositArtifact) : []

  const freeSlots = inventory
    ? computeFreeSlotsByPool(inventory.items, inventory, definitionsById)
    : { inventory: 0, collection: 0, playback: 0 }

  const toastResult = (
    data: { success: boolean; message?: string },
    okTitle: string,
    failTitle: string,
  ) => {
    toaster.create({
      title: data.success ? okTitle : failTitle,
      description: data.message ?? (data.success ? "Done." : "Failed."),
      type: data.success ? "success" : "error",
    })
    if (data.success) refreshStoredArtifacts()
  }

  const submitRetrieve = () => {
    if (!retrieveForId || !password.trim()) return
    const artifactId = retrieveForId
    const pw = password
    const contentIds = selectedIds.length === retrieveContents.length ? undefined : selectedIds
    subscribe<{ success: boolean; message?: string }>({
      id: `retrieve-artifact-${artifactId}-${Date.now()}`,
      eventType: "RETRIEVE_STORED_ARTIFACT_RESULT",
      timeoutMs: 15_000,
      onResult: (data) => {
        toastResult(data, "Success", "Error")
        setRetrieveForId(null)
        setPassword("")
        setSelectedIds([])
      },
    })
    emitToSocket("RETRIEVE_STORED_ARTIFACT", {
      artifactId,
      password: pw,
      ...(contentIds ? { contentIds } : {}),
    })
  }

  const submitDeposit = () => {
    if (!depositForId || !depositPassword.trim()) return
    const artifactId = depositForId
    const coinAmount = Number.parseInt(coinAmountStr, 10)
    subscribe<{ success: boolean; message?: string }>({
      id: `deposit-artifact-${artifactId}-${Date.now()}`,
      eventType: "DEPOSIT_STORED_ARTIFACT_RESULT",
      timeoutMs: 15_000,
      onResult: (data) => {
        toastResult(data, "Added", "Error")
        setDepositForId(null)
        setDepositPassword("")
        setPickedDepositIds([])
        setCoinAmountStr("")
      },
    })
    emitToSocket("DEPOSIT_STORED_ARTIFACT", {
      artifactId,
      password: depositPassword,
      ...(pickedDepositIds.length > 0 ? { targetInventoryItemIds: pickedDepositIds } : {}),
      ...(Number.isFinite(coinAmount) && coinAmount > 0 ? { coinAmount } : {}),
    })
  }

  const openRetrieve = (a: StoredArtifactPublic) => {
    const contents = readArtifactContents(a)
    setRetrieveForId(a.id)
    setPassword("")
    setSelectedIds(selectFittingContentIds(contents, freeSlots, definitionsById))
  }

  const openDeposit = (a: StoredArtifactPublic) => {
    setDepositForId(a.id)
    setDepositPassword("")
    setPickedDepositIds([])
    setCoinAmountStr("")
  }

  const toggleRetrieve = (id: string) => {
    if (!retrieveArtifact) return
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    const plan = planWithdrawal({
      contents: retrieveContents,
      selectedIds: next,
      containerDefinitionId: retrieveArtifact.containerDefinitionId,
      freeSlotsByPool: freeSlots,
      definitionsById,
    })
    if (plan.rejected.length > 0 && !selectedIds.includes(id)) return
    setSelectedIds(next)
  }

  const depositableItems: InventoryItem[] = (inventory?.items ?? []).filter((row) => {
    const def = definitionMap.get(row.definitionId)
    return !isStorageContainerDefinition(def)
  })
  const coinBalance = Math.max(0, Math.floor(gameState?.state?.attributes?.coin ?? 0))
  const cashBoxMode = isCoinStash(depositContents)
  const containerDef = depositArtifact?.containerDefinitionId
    ? definitionMap.get(depositArtifact.containerDefinitionId)
    : undefined
  const remainingCapacity = remainingStashSlots(
    depositContents.length,
    depositArtifact?.storageCapacity ?? readStorageCapacity(containerDef),
  )

  const retrieveIsEmpty = retrieveArtifact != null && retrieveContents.length === 0
  const retrieveContainerName = containerDisplayName(retrieveArtifact, definitionMap)
  /** An empty stash is only worth opening to pocket its container. */
  const containerBlocked =
    retrieveIsEmpty &&
    planWithdrawal({
      contents: [],
      selectedIds: [],
      containerDefinitionId: retrieveArtifact?.containerDefinitionId,
      freeSlotsByPool: freeSlots,
      definitionsById,
    }).containerBlocked

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
        <Text fontSize="xs" color="fg.muted">
          Anyone can try to retrieve these with the password that was set when they were stored.
          Names and notes are public.
        </Text>
        {artifacts.map((a) => {
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
                    {kindBadge(contents)}
                  </Badge>
                </HStack>
                {a.label?.trim() || isEmpty ? (
                  <Text fontSize="xs" color="fg.muted">
                    {summary}
                  </Text>
                ) : null}
                <Text fontSize="xs" color="fg.muted">
                  Stored by {a.storedByUsername} · {formatWhen(a.storedAt)}
                </Text>
              </VStack>
              <Stack gap={1} direction={["row", "column"]}>
                <Button flex={1} variant="outline" onClick={() => openDeposit(a)}>
                  Add
                </Button>
                <Button
                  flex={1}
                  variant="solid"
                  colorPalette="action"
                  onClick={() => openRetrieve(a)}
                >
                  {isEmpty ? "Move to inventory" : "Retrieve"}
                </Button>
              </Stack>
            </Stack>
          )
        })}
      </Stack>

      <DialogRoot
        open={retrieveForId != null}
        onOpenChange={(e) => {
          if (!e.open) {
            setRetrieveForId(null)
            setPassword("")
            setSelectedIds([])
          }
        }}
        placement="center"
      >
        <Portal>
          <DialogBackdrop />
          <DialogPositioner>
            <DialogContent maxW="sm" mx={2} bg="appBg" layerStyle="themeTransition">
              <DialogCloseTrigger asChild zIndex={1}>
                <CloseButton />
              </DialogCloseTrigger>
              <DialogHeader>
                <DialogTitle>Retrieve from storage</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <Stack gap={3}>
                  {retrieveIsEmpty ? (
                    <Stack gap={1}>
                      <Text fontSize="sm">{emptyStashLine(retrieveContainerName)}</Text>
                      {containerBlocked ? (
                        <Text fontSize="sm" color="fg.error">
                          This won't fit in your inventory. Get rid of items to make space.
                        </Text>
                      ) : null}
                    </Stack>
                  ) : (
                    <Stack gap={1}>
                      <Text fontWeight="semibold" fontSize="sm">
                        Items to retrieve from storage ({selectedIds.length} selected)
                      </Text>
                      {retrieveContents.map((c) => {
                        const checked = selectedIds.includes(c.id)
                        const trial = checked
                          ? selectedIds.filter((id) => id !== c.id)
                          : [...selectedIds, c.id]
                        const wouldReject =
                          !checked &&
                          retrieveArtifact != null &&
                          planWithdrawal({
                            contents: retrieveContents,
                            selectedIds: trial,
                            containerDefinitionId: retrieveArtifact.containerDefinitionId,
                            freeSlotsByPool: freeSlots,
                            definitionsById,
                          }).rejected.length > 0
                        return (
                          <Checkbox.Root
                            key={c.id}
                            checked={checked}
                            disabled={wouldReject}
                            onCheckedChange={() => toggleRetrieve(c.id)}
                          >
                            <Checkbox.HiddenInput />
                            <Checkbox.Control>
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                            <Checkbox.Label>
                              {contentLine(c)}
                              {c.kind === "item"
                                ? ` · ${resolveSlotPool(definitionsById[c.itemDefinitionId])}`
                                : ""}
                            </Checkbox.Label>
                          </Checkbox.Root>
                        )
                      })}
                    </Stack>
                  )}
                  {retrieveArtifact?.note?.trim() ? (
                    <Text fontSize="sm" color="fg.muted">
                      Hint: {retrieveArtifact.note}
                    </Text>
                  ) : null}
                  <Text fontSize="sm" color="fg.muted">
                    Enter the password for this stash.
                  </Text>
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                  />
                </Stack>
              </DialogBody>
              <DialogFooter>
                <HStack gap={2} justify="flex-end" width="full">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRetrieveForId(null)
                      setPassword("")
                      setSelectedIds([])
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="action"
                    disabled={
                      !password.trim() ||
                      containerBlocked ||
                      (!retrieveIsEmpty && selectedIds.length === 0)
                    }
                    onClick={submitRetrieve}
                  >
                    {retrieveIsEmpty ? "Move to inventory" : "Retrieve"}
                  </Button>
                </HStack>
              </DialogFooter>
            </DialogContent>
          </DialogPositioner>
        </Portal>
      </DialogRoot>

      <DialogRoot
        open={depositForId != null}
        onOpenChange={(e) => {
          if (!e.open) {
            setDepositForId(null)
            setDepositPassword("")
            setPickedDepositIds([])
            setCoinAmountStr("")
          }
        }}
        placement="center"
      >
        <Portal>
          <DialogBackdrop />
          <DialogPositioner>
            <DialogContent maxW="sm" mx={2} bg="appBg" layerStyle="themeTransition">
              <DialogCloseTrigger asChild zIndex={1}>
                <CloseButton />
              </DialogCloseTrigger>
              <DialogHeader fontWeight="semibold">
                <DialogTitle>Add to storage</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <Stack gap={6}>
                  {cashBoxMode ? (
                    <Stack gap={1}>
                      <Text fontSize="sm">Coins to add (max {coinBalance.toLocaleString()})</Text>
                      <Input
                        inputMode="numeric"
                        placeholder="Amount"
                        value={coinAmountStr}
                        onChange={(e) => setCoinAmountStr(e.target.value.replace(/\D/g, ""))}
                      />
                    </Stack>
                  ) : (
                    <Stack gap={2}>
                      <Stack gap={1}>
                        <Text fontWeight="semibold" fontSize="sm">
                          Items to add ({pickedDepositIds.length} selected
                          {remainingCapacity == null
                            ? ""
                            : remainingCapacity > 0
                              ? `, ${remainingCapacity} slot${
                                  remainingCapacity === 1 ? "" : "s"
                                } left`
                              : ", full"}
                          )
                        </Text>
                        {depositableItems.length === 0 ? (
                          <Text fontSize="xs" color="fg.muted">
                            Nothing in your bags to add.
                          </Text>
                        ) : (
                          depositableItems.map((row) => {
                            const def = definitionMap.get(row.definitionId)
                            const selected = pickedDepositIds.includes(row.itemId)
                            const atCap =
                              remainingCapacity != null &&
                              !selected &&
                              pickedDepositIds.length >= remainingCapacity
                            return (
                              <Checkbox.Root
                                key={row.itemId}
                                checked={selected}
                                disabled={atCap}
                                onCheckedChange={() => {
                                  setPickedDepositIds((prev) =>
                                    prev.includes(row.itemId)
                                      ? prev.filter((id) => id !== row.itemId)
                                      : remainingCapacity != null &&
                                          prev.length >= remainingCapacity
                                        ? prev
                                        : [...prev, row.itemId],
                                  )
                                }}
                              >
                                <Checkbox.HiddenInput />
                                <Checkbox.Control>
                                  <Checkbox.Indicator />
                                </Checkbox.Control>
                                <Checkbox.Label>
                                  {def?.name ?? row.definitionId}
                                  {row.quantity > 1 ? ` ×${row.quantity}` : ""}
                                </Checkbox.Label>
                              </Checkbox.Root>
                            )
                          })
                        )}
                      </Stack>
                    </Stack>
                  )}
                  <Stack>
                    <Text fontSize="sm" fontWeight="semibold">
                      Enter the password for this stash.
                    </Text>
                    <Input
                      type="password"
                      placeholder="Password"
                      value={depositPassword}
                      onChange={(e) => setDepositPassword(e.target.value)}
                      autoComplete="off"
                    />
                  </Stack>
                </Stack>
              </DialogBody>
              <DialogFooter>
                <Button
                  size="sm"
                  colorPalette="action"
                  disabled={
                    !depositPassword.trim() ||
                    (cashBoxMode
                      ? !coinAmountStr || Number.parseInt(coinAmountStr, 10) < 1
                      : pickedDepositIds.length === 0)
                  }
                  onClick={submitDeposit}
                >
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </DialogPositioner>
        </Portal>
      </DialogRoot>
    </>
  )
}

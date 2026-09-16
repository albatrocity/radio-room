import { useState } from "react"
import {
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
  Input,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition, StoredArtifactPublic } from "@repo/types"
import { isStorageContainerDefinition } from "@repo/types"
import { readArtifactContents, readStorageCapacity, remainingStashSlots } from "@repo/game-logic"
import { emitToSocket } from "../../../actors/socketActor"
import { useSocketResultHandle } from "../../../lib/subscribeForSocketResult"
import { toaster } from "../../ui/toaster"

function isCoinStash(
  contents: ReturnType<typeof readArtifactContents>,
): boolean {
  return contents.length > 0 && contents.every((c) => c.kind === "coin")
}

export function DepositStashDialog({
  artifact,
  inventoryItems,
  definitionMap,
  coinBalance,
  onClose,
  onSuccess,
}: {
  artifact: StoredArtifactPublic | null
  inventoryItems: InventoryItem[]
  definitionMap: Map<string, ItemDefinition>
  coinBalance: number
  onClose: () => void
  onSuccess: () => void
}) {
  const { subscribe } = useSocketResultHandle()
  const [password, setPassword] = useState("")
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [coinAmountStr, setCoinAmountStr] = useState("")

  const contents = artifact ? readArtifactContents(artifact) : []
  const cashBoxMode = isCoinStash(contents)
  const depositableItems = inventoryItems.filter((row) => {
    const def = definitionMap.get(row.definitionId)
    return !isStorageContainerDefinition(def)
  })
  const containerDef = artifact?.containerDefinitionId
    ? definitionMap.get(artifact.containerDefinitionId)
    : undefined
  const remainingCapacity = remainingStashSlots(
    contents.length,
    artifact?.storageCapacity ?? readStorageCapacity(containerDef),
  )

  const submit = () => {
    if (!artifact || !password.trim()) return
    const id = artifact.id
    const coinAmount = Number.parseInt(coinAmountStr, 10)
    subscribe<{ success: boolean; message?: string }>({
      id: `deposit-artifact-${id}-${Date.now()}`,
      eventType: "DEPOSIT_STORED_ARTIFACT_RESULT",
      timeoutMs: 15_000,
      onResult: (data) => {
        toaster.create({
          title: data.success ? "Added" : "Error",
          description: data.message ?? (data.success ? "Done." : "Failed."),
          type: data.success ? "success" : "error",
        })
        onSuccess()
      },
    })
    emitToSocket("DEPOSIT_STORED_ARTIFACT", {
      artifactId: id,
      password,
      ...(pickedIds.length > 0 ? { targetInventoryItemIds: pickedIds } : {}),
      ...(Number.isFinite(coinAmount) && coinAmount > 0 ? { coinAmount } : {}),
    })
  }

  return (
    <DialogRoot
      open={artifact != null}
      onOpenChange={(e) => {
        if (!e.open) onClose()
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
                        Items to add ({pickedIds.length} selected
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
                          const selected = pickedIds.includes(row.itemId)
                          const atCap =
                            remainingCapacity != null &&
                            !selected &&
                            pickedIds.length >= remainingCapacity
                          return (
                            <Checkbox.Root
                              key={row.itemId}
                              checked={selected}
                              disabled={atCap}
                              onCheckedChange={() => {
                                setPickedIds((prev) =>
                                  prev.includes(row.itemId)
                                    ? prev.filter((id) => id !== row.itemId)
                                    : remainingCapacity != null && prev.length >= remainingCapacity
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                  !password.trim() ||
                  (cashBoxMode
                    ? !coinAmountStr || Number.parseInt(coinAmountStr, 10) < 1
                    : pickedIds.length === 0)
                }
                onClick={submit}
              >
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogPositioner>
      </Portal>
    </DialogRoot>
  )
}

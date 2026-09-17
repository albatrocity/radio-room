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
  HStack,
  Input,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react"
import type { ItemDefinition, ItemSlotPool, StoredArtifactPublic } from "@repo/types"
import { resolveSlotPool } from "@repo/types"
import {
  artifactSummaryLabel,
  emptyStashLine,
  planWithdrawal,
  readArtifactContents,
  selectFittingContentIds,
} from "@repo/game-logic"
import { emitToSocket } from "../../../actors/socketActor"
import { useSocketResultHandle } from "../../../lib/subscribeForSocketResult"
import { toaster } from "../../ui/toaster"
import { containerDisplayName } from "./stashUi"

export function RetrieveStashDialog({
  artifact,
  pickGranted,
  freeSlots,
  definitionsById,
  definitionMap,
  onClose,
  onSuccess,
}: {
  artifact: StoredArtifactPublic | null
  pickGranted?: boolean
  freeSlots: Record<ItemSlotPool, number>
  definitionsById: Record<string, ItemDefinition | undefined>
  definitionMap: Map<string, ItemDefinition>
  onClose: () => void
  onSuccess: () => void
}) {
  const { subscribe } = useSocketResultHandle()
  const contents = artifact ? readArtifactContents(artifact) : []
  const [selectedIds, setSelectedIds] = useState(() =>
    artifact ? selectFittingContentIds(contents, freeSlots, definitionsById) : [],
  )
  const [password, setPassword] = useState("")

  const grantActive =
    pickGranted === true || (artifact?.accessGrantExpiresAt ?? 0) > Date.now()
  const grantMinsLeft =
    grantActive && artifact?.accessGrantExpiresAt
      ? Math.max(1, Math.ceil((artifact.accessGrantExpiresAt - Date.now()) / 60_000))
      : 0

  const isEmpty = artifact != null && contents.length === 0
  const containerName = containerDisplayName(artifact ?? undefined, definitionMap)
  const containerBlocked =
    isEmpty &&
    planWithdrawal({
      contents: [],
      selectedIds: [],
      containerDefinitionId: artifact?.containerDefinitionId,
      freeSlotsByPool: freeSlots,
      definitionsById,
    }).containerBlocked

  const toggle = (id: string) => {
    if (!artifact) return
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    const plan = planWithdrawal({
      contents,
      selectedIds: next,
      containerDefinitionId: artifact.containerDefinitionId,
      freeSlotsByPool: freeSlots,
      definitionsById,
    })
    if (plan.rejected.length > 0 && !selectedIds.includes(id)) return
    setSelectedIds(next)
  }

  const submit = () => {
    if (!artifact) return
    if (!grantActive && !password.trim()) return
    const id = artifact.id
    const pw = password
    const contentIds = selectedIds.length === contents.length ? undefined : selectedIds
    subscribe<{ success: boolean; message?: string }>({
      id: `retrieve-artifact-${id}-${Date.now()}`,
      eventType: "RETRIEVE_STORED_ARTIFACT_RESULT",
      timeoutMs: 15_000,
      onResult: (data) => {
        toaster.create({
          title: data.success ? "Success" : "Error",
          description: data.message ?? (data.success ? "Done." : "Failed."),
          type: data.success ? "success" : "error",
        })
        onSuccess()
      },
    })
    emitToSocket("RETRIEVE_STORED_ARTIFACT", {
      artifactId: id,
      ...(grantActive ? { useAccessGrant: true } : { password: pw }),
      ...(contentIds ? { contentIds } : {}),
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
            <DialogHeader>
              <DialogTitle>Retrieve from storage</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <Stack gap={3}>
                {isEmpty ? (
                  <Stack gap={1}>
                    <Text fontSize="sm">{emptyStashLine(containerName)}</Text>
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
                    {contents.map((c) => {
                      const checked = selectedIds.includes(c.id)
                      const trial = checked
                        ? selectedIds.filter((id) => id !== c.id)
                        : [...selectedIds, c.id]
                      const wouldReject =
                        !checked &&
                        artifact != null &&
                        planWithdrawal({
                          contents,
                          selectedIds: trial,
                          containerDefinitionId: artifact.containerDefinitionId,
                          freeSlotsByPool: freeSlots,
                          definitionsById,
                        }).rejected.length > 0
                      return (
                        <Checkbox.Root
                          key={c.id}
                          checked={checked}
                          disabled={wouldReject}
                          onCheckedChange={() => toggle(c.id)}
                        >
                          <Checkbox.HiddenInput />
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                          <Checkbox.Label>
                            {artifactSummaryLabel([c])}
                            {c.kind === "item"
                              ? ` · ${resolveSlotPool(definitionsById[c.itemDefinitionId])}`
                              : ""}
                          </Checkbox.Label>
                        </Checkbox.Root>
                      )
                    })}
                  </Stack>
                )}
                {grantActive ? (
                  <Stack gap={1}>
                    <Text fontSize="sm" color="fg.muted">
                      The lock is already open. Take what you can carry.
                    </Text>
                    {grantMinsLeft > 0 ? (
                      <Text fontSize="xs" color="fg.muted">
                        {grantMinsLeft} min left
                      </Text>
                    ) : null}
                  </Stack>
                ) : (
                  <>
                    {artifact?.note?.trim() ? (
                      <Text fontSize="sm" color="fg.muted">
                        Hint: {artifact.note}
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
                  </>
                )}
              </Stack>
            </DialogBody>
            <DialogFooter>
              <HStack gap={2} justify="flex-end" width="full">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  colorPalette="action"
                  disabled={
                    (!grantActive && !password.trim()) ||
                    containerBlocked ||
                    (!isEmpty && selectedIds.length === 0)
                  }
                  onClick={submit}
                >
                  {isEmpty ? "Move to inventory" : "Retrieve"}
                </Button>
              </HStack>
            </DialogFooter>
          </DialogContent>
        </DialogPositioner>
      </Portal>
    </DialogRoot>
  )
}

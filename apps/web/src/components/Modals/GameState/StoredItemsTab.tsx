import { useState } from "react"
import {
  Badge,
  Button,
  CloseButton,
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogPositioner,
  DialogRoot,
  HStack,
  Input,
  Portal,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { emitToSocket } from "../../../actors/socketActor"
import { refreshStoredArtifacts } from "../../../actors/userGameStateActor"
import { useStoredArtifacts } from "../../../hooks/useActors"
import { useSocketResultHandle } from "../../../lib/subscribeForSocketResult"
import { toaster } from "../../ui/toaster"

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

export default function StoredItemsTab() {
  const artifacts = useStoredArtifacts()
  const [retrieveForId, setRetrieveForId] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const { subscribe } = useSocketResultHandle()

  const submitRetrieve = () => {
    if (!retrieveForId || !password.trim()) return
    const artifactId = retrieveForId
    const pw = password
    subscribe<{ success: boolean; message?: string }>({
      id: `retrieve-artifact-${artifactId}-${Date.now()}`,
      eventType: "RETRIEVE_STORED_ARTIFACT_RESULT",
      timeoutMs: 15_000,
      onResult: (data) => {
        toaster.create({
          title: data.success ? "Success" : "Error",
          description:
            data.message ?? (data.success ? "Retrieved from storage." : "Could not retrieve."),
          type: data.success ? "success" : "error",
        })
        setRetrieveForId(null)
        setPassword("")
        if (data.success) {
          refreshStoredArtifacts()
        }
      },
    })

    emitToSocket("RETRIEVE_STORED_ARTIFACT", { artifactId, password: pw })
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
        <Text fontSize="xs" color="fg.muted">
          Anyone can try to unlock these with the password that was set when they were stored.
        </Text>
        {artifacts.map((a) => {
          const label =
            a.artifactType === "coin"
              ? `${(a.coinValue ?? 0).toLocaleString()} coins`
              : `${a.itemName ?? "Item"}${a.itemQuantity && a.itemQuantity > 1 ? ` ×${a.itemQuantity}` : ""}`
          return (
            <HStack
              key={a.id}
              align="flex-start"
              gap={3}
              borderWidth="1px"
              borderColor="border.muted"
              borderRadius="md"
              p={3}
              flexWrap="wrap"
            >
              <VStack align="start" gap={0} flex="1" minW={0}>
                <HStack gap={2} flexWrap="wrap">
                  <Text fontWeight="medium">{label}</Text>
                  <Badge size="sm" variant="outline">
                    {a.artifactType === "coin" ? "Coins" : "Item"}
                  </Badge>
                </HStack>
                <Text fontSize="xs" color="fg.muted">
                  Stored by {a.storedByUsername} · {formatWhen(a.storedAt)}
                </Text>
              </VStack>
              <Button
                size="xs"
                variant="solid"
                colorPalette="action"
                onClick={() => {
                  setRetrieveForId(a.id)
                  setPassword("")
                }}
              >
                Retrieve
              </Button>
            </HStack>
          )
        })}
      </Stack>

      <DialogRoot
        open={retrieveForId != null}
        onOpenChange={(e) => {
          if (!e.open) {
            setRetrieveForId(null)
            setPassword("")
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
              <DialogHeader fontWeight="semibold">Unlock storage</DialogHeader>
              <DialogBody>
                <Stack gap={2}>
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
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="action"
                    disabled={!password.trim()}
                    onClick={submitRetrieve}
                  >
                    Unlock
                  </Button>
                </HStack>
              </DialogFooter>
            </DialogContent>
          </DialogPositioner>
        </Portal>
      </DialogRoot>
    </>
  )
}

import { useEffect, useRef, useState } from "react"
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
import type { StoredArtifactPublic } from "@repo/types"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
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

export default function StoredItemsTab({
  artifacts,
  onRefresh,
}: {
  artifacts: StoredArtifactPublic[]
  onRefresh: () => void
}) {
  const [retrieveForId, setRetrieveForId] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const subscriptionIdRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      const id = subscriptionIdRef.current
      if (id) unsubscribeById(id)
    }
  }, [])

  const submitRetrieve = () => {
    if (!retrieveForId || !password.trim()) return
    const artifactId = retrieveForId
    const pw = password
    const subscriptionId = `retrieve-artifact-${artifactId}-${Date.now()}`
    subscriptionIdRef.current = subscriptionId

    subscribeById(subscriptionId, {
      send: (event: { type: string; data?: { success: boolean; message?: string } }) => {
        if (event.type !== "RETRIEVE_STORED_ARTIFACT_RESULT" || !event.data) return
        unsubscribeById(subscriptionId)
        subscriptionIdRef.current = null
        toaster.create({
          title: event.data.success ? "Success" : "Error",
          description:
            event.data.message ??
            (event.data.success ? "Retrieved from storage." : "Could not retrieve."),
          type: event.data.success ? "success" : "error",
        })
        setRetrieveForId(null)
        setPassword("")
        if (event.data.success) {
          onRefresh()
        }
      },
    })

    emitToSocket("RETRIEVE_STORED_ARTIFACT", { artifactId, password: pw })

    setTimeout(() => {
      if (subscriptionIdRef.current === subscriptionId) {
        unsubscribeById(subscriptionId)
        subscriptionIdRef.current = null
        toaster.create({ title: "Timeout", description: "Action timed out", type: "error" })
      }
    }, 15000)
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
              <DialogCloseTrigger asChild position="absolute" top="2" right="2" zIndex={1}>
                <CloseButton size="sm" />
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

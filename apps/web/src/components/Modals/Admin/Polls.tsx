import { useCallback, useEffect, useState } from "react"
import {
  Badge,
  Box,
  Button,
  DialogBody,
  DialogFooter,
  HStack,
  Separator,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useActivePoll, useCurrentRoom, useModalsSend } from "../../../hooks/useActors"
import { emitToSocket } from "../../../actors/socketActor"
import PollAuthor from "./PollAuthor"

export default function Polls() {
  const modalSend = useModalsSend()
  const room = useCurrentRoom()
  const activePoll = useActivePoll()
  const [closing, setClosing] = useState(false)

  const hasActiveOpenPoll = activePoll?.status === "open"
  const roomId = room?.id

  const closePoll = useCallback(() => {
    if (!activePoll || activePoll.status !== "open") return
    setClosing(true)
    emitToSocket("CLOSE_POLL", { pollId: activePoll.id })
  }, [activePoll])

  useEffect(() => {
    if (activePoll?.status !== "open") {
      setClosing(false)
    }
  }, [activePoll?.status])

  return (
    <>
      <DialogBody>
        <VStack align="stretch" gap={4}>
          {hasActiveOpenPoll && activePoll && (
            <Box
              borderWidth="1px"
              borderColor="border.muted"
              borderRadius="lg"
              p={4}
              bg="bg.subtle"
            >
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between" align="flex-start" gap={3} flexWrap="wrap">
                  <VStack align="start" gap={1} flex="1" minW={0}>
                    <HStack gap={2} flexWrap="wrap">
                      <Text fontWeight="semibold" fontSize="md">
                        {activePoll.question}
                      </Text>
                      <Badge size="sm" colorPalette="green" variant="solid">
                        Open
                      </Badge>
                    </HStack>
                    <Text fontSize="sm" color="fg.muted">
                      {activePoll.options.length} options · Poll ID {activePoll.id}
                    </Text>
                  </VStack>
                  <Button
                    colorPalette="red"
                    variant="solid"
                    loading={closing}
                    onClick={closePoll}
                    flexShrink={0}
                  >
                    Close poll
                  </Button>
                </HStack>
              </VStack>
            </Box>
          )}

          {!hasActiveOpenPoll && (
            <Text fontSize="sm" color="fg.muted">
              No poll is currently open. Create one below to let listeners vote in the room.
            </Text>
          )}

          <Separator />

          <PollAuthor roomId={roomId} hasActiveOpenPoll={hasActiveOpenPoll} />
        </VStack>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => modalSend({ type: "BACK" })}>
          Back
        </Button>
      </DialogFooter>
    </>
  )
}

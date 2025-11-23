import React, { useEffect } from "react"
import { motion } from "framer-motion"
import { Box, Heading, Stack, useBoolean } from "@chakra-ui/react"

import FormAddToQueue from "../FormAddToQueue"
import Modal from "../Modal"
import { useModalsStore } from "../../state/modalsState"
import SavedTracks from "../SavedTracks"
import useAddToQueue from "../useAddToQueue"
import {
  useIsMetadataSourceAuthenticated,
  useMetadataSourceAuthStore,
} from "../../state/metadataSourceAuthStore"
import { useIsAdmin, useCurrentUser } from "../../state/authStore"
import { useCurrentRoom } from "../../state/roomStore"

const MotionBox = motion(Box)

function ModalAddToQueue() {
  const { send } = useModalsStore()
  const [open, setOpen] = useBoolean(false)
  const { addToQueue, state } = useAddToQueue()
  const isAddingToQueue = useModalsStore((s: any) => s.state.matches("queue"))
  const isMetadataSourceAuthenticated = useIsMetadataSourceAuthenticated()
  const { send: sendAuth } = useMetadataSourceAuthStore()
  const isAdmin = useIsAdmin()
  const currentUser = useCurrentUser()
  const room = useCurrentRoom()
  const hideEditForm = () => send("CLOSE")

  // Initialize auth check when modal opens
  useEffect(() => {
    if (isAddingToQueue && isAdmin && room?.metadataSourceId && currentUser?.userId) {
      // Determine service name from metadata source ID
      // Format: "spotify-metadata" -> "spotify"
      const serviceName = room.metadataSourceId.split("-")[0]
      sendAuth("INIT", {
        data: {
          userId: currentUser.userId,
          serviceName,
        },
      })
      sendAuth("FETCH_STATUS")
    }
  }, [isAddingToQueue, isAdmin, room?.metadataSourceId, currentUser?.userId, sendAuth])

  const canViewSavedTracks = isAdmin && isMetadataSourceAuthenticated

  const isLoading = state.matches("loading")
  const loadingItem = isLoading ? state.context.queuedTrack : undefined

  function handleOpenDropdown(isOpen: boolean) {
    if (isOpen) {
      setOpen.on()
    } else {
      setOpen.off()
    }
  }

  return (
    <Modal isOpen={isAddingToQueue} onClose={hideEditForm} heading="Add to play queue">
      <Stack direction="column" spacing={8}>
        <Box zIndex={2}>
          <FormAddToQueue
            onAddToQueue={addToQueue}
            isDisabled={isLoading}
            onDropdownOpenChange={handleOpenDropdown}
          />
        </Box>
        {canViewSavedTracks && (
          <Box>
            <MotionBox
              position="absolute"
              top={0}
              left={0}
              zIndex={1}
              h="100%"
              w="100%"
              animate={{
                pointerEvents: open ? "auto" : "none",
              }}
            />
            <MotionBox
              animate={{
                opacity: open ? 0.1 : isLoading ? 0.5 : 1,
              }}
            >
              <Heading as="h4" size="sm" mb={2}>
                Your recently liked tracks
              </Heading>
              <SavedTracks
                isDisabled={isLoading || open}
                loadingItem={loadingItem}
                onClick={open ? undefined : addToQueue}
              />
            </MotionBox>
          </Box>
        )}
      </Stack>
    </Modal>
  )
}

export default ModalAddToQueue

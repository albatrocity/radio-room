import React, { useEffect, useState } from "react"
import { Box, Heading, Stack } from "@chakra-ui/react"

import FormAddToQueue from "../FormAddToQueue"
import Modal from "../Modal"
import SavedTracks from "../SavedTracks"
import useAddToQueue from "../useAddToQueue"
import {
  useModalsSend,
  useIsModalOpen,
  useIsMetadataSourceAuthenticated,
  useMetadataSourceAuthSend,
  useIsAdmin,
  useCurrentUser,
  useCurrentRoom,
} from "../../hooks/useActors"

function ModalAddToQueue() {
  const modalSend = useModalsSend()
  const [open, setOpen] = useState(false)
  const { addToQueue, state } = useAddToQueue()
  const isAddingToQueue = useIsModalOpen("queue")
  const isMetadataSourceAuthenticated = useIsMetadataSourceAuthenticated()
  const metadataAuthSend = useMetadataSourceAuthSend()
  const isAdmin = useIsAdmin()
  const currentUser = useCurrentUser()
  const room = useCurrentRoom()
  const hideEditForm = () => modalSend({ type: "CLOSE" })

  // Initialize auth check when modal opens
  useEffect(() => {
    if (isAddingToQueue && isAdmin && room?.metadataSourceId && currentUser?.userId) {
      // Determine service name from metadata source ID
      // Format: "spotify-metadata" -> "spotify"
      const serviceName = room.metadataSourceId.split("-")[0]
      metadataAuthSend({
        type: "INIT",
        data: {
          userId: currentUser.userId,
          serviceName,
        },
      })
      metadataAuthSend({ type: "FETCH_STATUS" })
    }
  }, [isAddingToQueue, isAdmin, room?.metadataSourceId, currentUser?.userId, metadataAuthSend])

  const canViewSavedTracks = isAdmin && isMetadataSourceAuthenticated

  const isLoading = state.matches("loading")
  const loadingItem = isLoading ? state.context.queuedTrack : undefined

  function handleOpenDropdown(isOpen: boolean) {
    setOpen(isOpen)
  }

  return (
    <Modal open={isAddingToQueue} onClose={hideEditForm} heading="Add to play queue">
      <Stack direction="column" gap={8}>
        <Box zIndex={2}>
          <FormAddToQueue
            onAddToQueue={addToQueue}
            isDisabled={isLoading}
            onDropdownOpenChange={handleOpenDropdown}
          />
        </Box>
        {canViewSavedTracks && (
          <Box>
            <Box
              position="absolute"
              top={0}
              left={0}
              zIndex={1}
              h="100%"
              w="100%"
              pointerEvents={open ? "auto" : "none"}
            />
            <Box
              opacity={open ? 0.1 : isLoading ? 0.5 : 1}
              transition="opacity 0.2s"
            >
              <Heading as="h4" size="sm" mb={2}>
                Your recently liked tracks
              </Heading>
              <SavedTracks
                isDisabled={isLoading || open}
                loadingItem={loadingItem}
                onClick={open ? undefined : addToQueue}
              />
            </Box>
          </Box>
        )}
      </Stack>
    </Modal>
  )
}

export default ModalAddToQueue

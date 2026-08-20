import React, { useEffect, useState } from "react"
import { Box, Heading, Stack } from "@chakra-ui/react"

import FormAddToQueue from "../FormAddToQueue"
import Modal from "../Modal"
import { PluginArea } from "../PluginComponents"
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
  refreshEffectiveMetadataSources,
} from "../../hooks/useActors"

function ModalAddToQueue() {
  const modalSend = useModalsSend()
  const [searchActive, setSearchActive] = useState(false)
  const { addToQueue, state } = useAddToQueue()
  const isAddingToQueue = useIsModalOpen("queue")
  const isMetadataSourceAuthenticated = useIsMetadataSourceAuthenticated()
  const metadataAuthSend = useMetadataSourceAuthSend()
  const isAdmin = useIsAdmin()
  const currentUser = useCurrentUser()
  const room = useCurrentRoom()
  const hideEditForm = () => modalSend({ type: "CLOSE" })

  // Re-evaluate plugin grants (e.g. Library Card / Physical Media) when the modal opens.
  useEffect(() => {
    if (isAddingToQueue) {
      refreshEffectiveMetadataSources()
    }
  }, [isAddingToQueue])

  // Initialize auth check when modal opens (use primary metadata source)
  const primaryMetadataSourceId = room?.metadataSourceIds?.[0]
  useEffect(() => {
    if (isAddingToQueue && isAdmin && primaryMetadataSourceId && currentUser?.userId) {
      // Determine service name from metadata source ID
      // Format: "spotify-metadata" -> "spotify"
      const serviceName = primaryMetadataSourceId.split("-")[0]
      metadataAuthSend({
        type: "INIT",
        data: {
          userId: currentUser.userId,
          serviceName,
        },
      })
      metadataAuthSend({ type: "FETCH_STATUS" })
    }
  }, [isAddingToQueue, isAdmin, primaryMetadataSourceId, currentUser?.userId, metadataAuthSend])

  useEffect(() => {
    if (!isAddingToQueue) {
      setSearchActive(false)
    }
  }, [isAddingToQueue])

  const canViewSavedTracks = isAdmin && isMetadataSourceAuthenticated

  const isLoading = state.matches("loading")
  const loadingItem = isLoading ? state.context.queuedTrack : undefined

  return (
    <Modal
      open={isAddingToQueue}
      onClose={hideEditForm}
      heading={
        <Heading as="h2" size="md">
          Add to play queue
        </Heading>
      }
      contentProps={{
        h: "min(90dvh, 44rem)",
        maxH: "90dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      bodyProps={{
        flex: "1",
        minH: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Stack direction="column" gap={8} flex="1" minH={0} h="100%">
        <PluginArea area="addToQueue" direction="column" />
        <Box flex="1" minH={0} display="flex" flexDirection="column">
          <FormAddToQueue
            onAddToQueue={addToQueue}
            isDisabled={isLoading}
            onSearchActiveChange={setSearchActive}
            fillHeight
          />
        </Box>
        {canViewSavedTracks && !searchActive && (
          <Box
            flexShrink={0}
            maxH="28%"
            overflowY="auto"
            opacity={searchActive ? 0.1 : isLoading ? 0.5 : 1}
            transition="opacity 0.2s"
            pointerEvents={searchActive ? "none" : "auto"}
          >
            <Heading as="h4" size="sm" mb={2}>
              Your recently liked tracks
            </Heading>
            <SavedTracks
              isDisabled={isLoading || searchActive}
              loadingItem={loadingItem}
              onClick={searchActive ? undefined : addToQueue}
            />
          </Box>
        )}
      </Stack>
    </Modal>
  )
}

export default ModalAddToQueue

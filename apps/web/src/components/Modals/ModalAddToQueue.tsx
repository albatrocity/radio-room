import React, { useEffect, useState } from "react"
import { Box, Heading, Stack } from "@chakra-ui/react"

import FormAddToQueue from "../FormAddToQueue"
import Modal from "../Modal"
import Drawer from "../Drawer"
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
import { useIsBelowLg } from "../../hooks/useIntegratedPanelPresentation"

/** Run after the browser paints so dialog chrome is not blocked by open-side work. */
function afterNextPaint(callback: () => void): () => void {
  let innerRaf = 0
  const outerRaf = requestAnimationFrame(() => {
    innerRaf = requestAnimationFrame(callback)
  })
  return () => {
    cancelAnimationFrame(outerRaf)
    if (innerRaf) cancelAnimationFrame(innerRaf)
  }
}

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
  const hideEditForm = () => modalSend({ type: "CLOSE_QUEUE" })

  // Re-evaluate plugin grants (e.g. Library Card / Physical Media) after first paint.
  useEffect(() => {
    if (!isAddingToQueue) return
    return afterNextPaint(() => {
      refreshEffectiveMetadataSources()
    })
  }, [isAddingToQueue])

  // Initialize auth check when modal opens (use primary metadata source)
  const primaryMetadataSourceId = room?.metadataSourceIds?.[0]
  useEffect(() => {
    if (!isAddingToQueue || !isAdmin || !primaryMetadataSourceId || !currentUser?.userId) return
    // Determine service name from metadata source ID
    // Format: "spotify-metadata" -> "spotify"
    const serviceName = primaryMetadataSourceId.split("-")[0]
    const userId = currentUser.userId
    return afterNextPaint(() => {
      metadataAuthSend({
        type: "INIT",
        data: {
          userId,
          serviceName,
        },
      })
      metadataAuthSend({ type: "FETCH_STATUS" })
    })
  }, [isAddingToQueue, isAdmin, primaryMetadataSourceId, currentUser?.userId, metadataAuthSend])

  useEffect(() => {
    if (!isAddingToQueue) {
      setSearchActive(false)
    }
  }, [isAddingToQueue])

  const canViewSavedTracks = isAdmin && isMetadataSourceAuthenticated

  const isLoading = state.matches("loading")
  const loadingItem = isLoading ? state.context.queuedTrack : undefined
  const isSheet = useIsBelowLg()

  const heading = (
    <Heading as="h2" size="md">
      Add to play queue
    </Heading>
  )

  const body = (
    <Stack direction="column" gap={8} flex="1" minH={0} h="100%">
      <PluginArea area="addToQueue" direction="column" />
      <Box flex="1" minH={0} minW={0} overflowX="hidden" display="flex" flexDirection="column">
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
  )

  if (isSheet) {
    return (
      <Drawer
        open={isAddingToQueue}
        onClose={hideEditForm}
        placement="bottom"
        size="full"
        heading={heading}
      >
        {body}
      </Drawer>
    )
  }

  return (
    <Modal
      open={isAddingToQueue}
      onClose={hideEditForm}
      // Keep Search/Browse warm across open/close (ADR 0090 / modal open latency).
      lazyMount={false}
      unmountOnExit={false}
      heading={heading}
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
      {body}
    </Modal>
  )
}

export default ModalAddToQueue

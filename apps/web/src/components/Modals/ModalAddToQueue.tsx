import React from "react"
import { motion } from "framer-motion"
import { Box, Heading, Stack, useBoolean } from "@chakra-ui/react"

import FormAddToQueue from "../FormAddToQueue"
import Modal from "../Modal"
import { useModalsStore } from "../../state/modalsState"
import SpotifySavedTracks from "../SpotifySavedTracks"
import useAddToSpotifyQueue from "../useAddToSpotifyQueue"
import { useIsSpotifyAuthenticated } from "../../state/spotifyAuthStore"

const MotionBox = motion(Box)

function ModalAddToQueue() {
  const { send } = useModalsStore()
  const [open, setOpen] = useBoolean(false)
  const { addToQueue, state } = useAddToSpotifyQueue()
  const isAddingToQueue = useModalsStore((s) => s.state.matches("queue"))
  const isAuthenticated = useIsSpotifyAuthenticated()
  const hideEditForm = () => send("CLOSE")

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
    <Modal
      isOpen={isAddingToQueue}
      onClose={hideEditForm}
      heading="Add to play queue"
    >
      <Stack direction="column" spacing={8}>
        <Box zIndex={2}>
          <FormAddToQueue
            onAddToQueue={addToQueue}
            isDisabled={isLoading}
            onDropdownOpenChange={handleOpenDropdown}
          />
        </Box>
        {isAuthenticated && (
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
              <SpotifySavedTracks
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

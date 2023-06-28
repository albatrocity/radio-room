import React from "react"
import { motion } from "framer-motion"
import { Box, Heading, Stack, useBoolean } from "@chakra-ui/react"

import FormAddToQueue from "../FormAddToQueue"
import Modal from "../Modal"
import { useModalsStore } from "../../state/modalsState"
import SpotifySavedTracks from "../SpotifySavedTracks"
import useAddToSpotifyQueue from "../useAddToSpotifyQueue"

const MotionBox = motion(Box)

function ModalAddToQueue() {
  const { send } = useModalsStore()
  const [focused, setFocused] = useBoolean(false)
  const { addToQueue, state } = useAddToSpotifyQueue()
  const isAddingToQueue = useModalsStore((s) => s.state.matches("queue"))
  const hideEditForm = () => send("CLOSE")

  const isLoading = state.matches("loading")
  const loadingItem = isLoading ? state.context.queuedTrack : undefined

  function handleFocus(isFocused: boolean) {
    if (isFocused) {
      setFocused.on()
    } else {
      setFocused.off()
    }
  }

  return (
    <Modal
      isOpen={isAddingToQueue}
      onClose={hideEditForm}
      heading="Add to play queue"
    >
      <Stack direction="column" spacing={8}>
        <FormAddToQueue
          onAddToQueue={addToQueue}
          isDisabled={isLoading}
          onFocusChange={handleFocus}
        />
        <Box>
          <Heading as="h4" size="sm" mb={2}>
            Your recently liked tracks
          </Heading>
          <MotionBox
            animate={{
              opacity: isLoading || focused ? 0.5 : 1,
            }}
          >
            <SpotifySavedTracks
              onClick={addToQueue}
              isDisabled={isLoading}
              loadingItem={loadingItem}
            />
          </MotionBox>
        </Box>
      </Stack>
    </Modal>
  )
}

export default ModalAddToQueue

import React from "react"
import { useMachine } from "@xstate/react"
import {
  Box,
  Button,
  HStack,
  VStack,
  Text,
  Spinner,
  Center,
} from "@chakra-ui/react"

import { useModalsStore } from "../../state/modalsState"
import { createRoomFormMachine } from "./createRoomFormMachine"

import Modal from "../Modal"
import { Room } from "../../types/Room"
import RoomSettings from "../RoomSettings/RoomSettings"

type Props = {}

export default function ModalCreateRoom({}: Props) {
  const { state, send } = useModalsStore()
  const [formState, formSend] = useMachine(createRoomFormMachine)
  const nextLabel = formState.matches("settings") ? "Login & Create" : "Next"
  const loading = formState.matches("creating")
  return (
    <form onSubmit={() => formSend("NEXT")}>
      <Modal
        isOpen={state.matches("createRoom")}
        heading="Create a Room"
        onClose={() => send("CLOSE")}
        footer={
          <HStack justify="space-between" w="100%">
            <HStack justifyContent="flex-end" flexGrow={1}>
              <Button
                isDisabled={loading}
                variant="ghost"
                onClick={() => send("CLOSE")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isDisabled={loading}
                onClick={() => formSend("NEXT")}
              >
                {nextLabel}
              </Button>
            </HStack>
          </HStack>
        }
      >
        <Box>
          {loading && (
            <Center>
              <VStack spacing={4}>
                <Text as="p">Redirecting you to Spotify</Text>
                <Spinner />
              </VStack>
            </Center>
          )}
          {formState.matches("settings") && (
            <RoomSettings
              roomType={formState.context.type}
              settings={formState.context}
              onChange={(settings: Partial<Room>) => {
                formSend("SET_SETTINGS", { data: { settings } })
              }}
            />
          )}
        </Box>
      </Modal>
    </form>
  )
}

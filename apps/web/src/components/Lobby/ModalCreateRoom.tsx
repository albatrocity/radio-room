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
import RoomTypeSelect from "./RoomTypeSelect"
import { ArrowBackIcon } from "@chakra-ui/icons"

type Props = {}

export default function ModalCreateRoom({}: Props) {
  const { state, send } = useModalsStore()
  const [formState, formSend] = useMachine(createRoomFormMachine)
  const nextLabel = formState.matches("settings") ? "Login & Create" : "Next"
  const loading = formState.matches("creating")
  
  const handleNext = () => {
    formSend("NEXT")
  }
  
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <Modal
        isOpen={state.matches("createRoom")}
        heading="Create a Room"
        onClose={() => send("CLOSE")}
        footer={
          <HStack justify="space-between" w="100%">
            {formState.matches("settings") && (
              <Button
                leftIcon={<ArrowBackIcon />}
                variant="ghost"
                onClick={() => formSend("BACK")}
                isDisabled={loading}
              >
                Back
              </Button>
            )}
            <HStack justifyContent="flex-end" flexGrow={1}>
              <Button
                isDisabled={loading}
                variant="ghost"
                onClick={() => send("CLOSE")}
              >
                Cancel
              </Button>
              <Button
                isDisabled={loading}
                onClick={handleNext}
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
          {formState.matches("selectType") && (
            <VStack alignItems="flex-start" spacing={4}>
              <Text as="p">
                Creating a room requires a Spotify Premium account to grab meta
                data and control a queue.
              </Text>
              <RoomTypeSelect
                onSelect={(type) => {
                  formSend("SELECT_TYPE", { data: { type } })
                }}
              />
            </VStack>
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

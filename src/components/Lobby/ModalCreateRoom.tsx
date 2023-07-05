import React from "react"
import { useMachine } from "@xstate/react"
import { Box, Button, HStack, VStack, Text } from "@chakra-ui/react"
import { ArrowBackIcon } from "@chakra-ui/icons"

import { useModalsStore } from "../../state/modalsState"
import { createRoomFormMachine } from "./createRoomFormMachine"

import RoomTypeSelect from "./RoomTypeSelect"
import Modal from "../Modal"
import { Room } from "../../types/Room"
import RoomSettings from "../RoomSettings/RoomSettings"

type Props = {}

export default function ModalCreateRoom({}: Props) {
  const { state, send } = useModalsStore()
  const [formState, formSend] = useMachine(createRoomFormMachine)
  const nextLabel = formState.matches("settings") ? "Login & Create" : "Next"
  return (
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
            >
              Back
            </Button>
          )}
          <HStack justifyContent="flex-end" flexGrow={1}>
            <Button variant="ghost" onClick={() => send("CLOSE")}>
              Cancel
            </Button>
            <Button onClick={() => formSend("NEXT")}>{nextLabel}</Button>
          </HStack>
        </HStack>
      }
    >
      <Box>
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
  )
}

import React from "react"
import { useMachine } from "@xstate/react"
import { Button, HStack, VStack } from "@chakra-ui/react"

import { useModalsStore } from "../../state/modalsState"
import { createRoomFormMachine } from "./createRoomFormMachine"

import RoomTypeSelect from "./RoomTypeSelect"
import Modal from "../Modal"
import { Room } from "../../types/Room"

type Props = {}

export default function ModalCreateRoom({}: Props) {
  const { state, send } = useModalsStore()
  const [formState, formSend] = useMachine(createRoomFormMachine)
  return (
    <Modal
      isOpen={state.matches("createRoom")}
      heading="Create a Room"
      onClose={() => send("CLOSE")}
      footer={
        <HStack>
          <Button variant="ghost" onClick={() => send("CLOSE")}>
            Cancel
          </Button>
          <Button onClick={() => formSend("NEXT")}>Next</Button>
        </HStack>
      }
    >
      <VStack>
        <RoomTypeSelect
          onSelect={(type: Room["type"]) =>
            formSend("NEXT", { data: { type } })
          }
        />
      </VStack>
    </Modal>
  )
}

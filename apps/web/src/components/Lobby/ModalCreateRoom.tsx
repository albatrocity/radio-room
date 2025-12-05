import React from "react"
import { useMachine } from "@xstate/react"
import { Box, Button, HStack, VStack, Text, Spinner, Center } from "@chakra-ui/react"

import { useModalsSend, useIsModalOpen } from "../../hooks/useActors"
import { createRoomFormMachine } from "./createRoomFormMachine"

import Modal from "../Modal"
import { Room } from "../../types/Room"
import RoomSettings from "../RoomSettings/RoomSettings"
import RoomTypeSelect from "./RoomTypeSelect"
import { LuArrowLeft } from "react-icons/lu"

type Props = {}

export default function ModalCreateRoom({}: Props) {
  const modalSend = useModalsSend()
  const isCreateRoomModalOpen = useIsModalOpen("createRoom")
  const [formState, formSend] = useMachine(createRoomFormMachine)
  const nextLabel = formState.matches("settings") ? "Login & Create" : "Next"
  const loading = formState.matches("creating")

  const handleNext = () => {
    formSend("NEXT")
  }

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <Modal
        open={isCreateRoomModalOpen}
        heading="Create a Room"
        onClose={() => modalSend({ type: "CLOSE" })}
        footer={
          <HStack justify="space-between" w="100%">
            {formState.matches("settings") && (
              <Button variant="ghost" onClick={() => formSend("BACK")} disabled={loading}>
                <LuArrowLeft />
                Back
              </Button>
            )}
            <HStack justifyContent="flex-end" flexGrow={1}>
              <Button
                disabled={loading}
                variant="ghost"
                onClick={() => modalSend({ type: "CLOSE" })}
              >
                Cancel
              </Button>
              <Button disabled={loading} onClick={handleNext}>
                {nextLabel}
              </Button>
            </HStack>
          </HStack>
        }
      >
        <Box>
          {loading && (
            <Center>
              <VStack gap={4}>
                <Text as="p">Redirecting you to Spotify</Text>
                <Spinner />
              </VStack>
            </Center>
          )}
          {formState.matches("selectType") && (
            <VStack alignItems="flex-start" gap={4}>
              <Text as="p">
                Creating a room requires a Spotify Premium account to grab meta data and control a
                queue.
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

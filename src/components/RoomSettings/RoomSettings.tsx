import React from "react"
import { Alert, AlertIcon, Text, VStack } from "@chakra-ui/react"

import { Room, RoomSetup } from "../../types/Room"
import FormJukeboxSettings from "./FormJukeboxSettings"
import FormRadioSettings from "./FormRadioSettings"
import SharedSettings from "./SharedSettings"

type Props = {
  roomType: Room["type"]
  settings: RoomSetup
  onChange: (settings: Partial<RoomSetup>) => void
}

export default function RoomSettings({ roomType, settings, onChange }: Props) {
  return (
    <VStack spacing={8} w="100%">
      <SharedSettings onChange={onChange} settings={settings} />
      {roomType === "jukebox" && <FormJukeboxSettings onChange={onChange} />}
      {roomType === "radio" && <FormRadioSettings onChange={onChange} />}
      <Alert status="warning" fontSize="sm" color="blackAlpha.700">
        <AlertIcon />
        Your room and all of its data will expire 24 hours after the last time
        you leave it. It will not expire if you are in it.
      </Alert>
    </VStack>
  )
}

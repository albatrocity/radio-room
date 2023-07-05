import React from "react"
import { VStack } from "@chakra-ui/react"

import { Room, RoomSetupShared } from "../../types/Room"
import FormJukeboxSettings from "./FormJukeboxSettings"
import FormRadioSettings from "./FormRadioSettings"
import SharedSettings from "./SharedSettings"

type Props = {
  roomType: Room["type"]
  settings: RoomSetupShared
  onChange: (settings: Partial<RoomSetupShared>) => void
}

export default function RoomSettings({ roomType, settings, onChange }: Props) {
  return (
    <VStack spacing={8} w="100%">
      <SharedSettings onChange={onChange} settings={settings} />
      {roomType === "jukebox" && <FormJukeboxSettings onChange={onChange} />}
      {roomType === "radio" && <FormRadioSettings onChange={onChange} />}
    </VStack>
  )
}

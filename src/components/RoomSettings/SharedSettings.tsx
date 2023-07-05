import React from "react"
import { FormControl, VStack, Input, FormLabel } from "@chakra-ui/react"

import { RoomSetupShared } from "../../types/Room"

type Props = {
  onChange: (settings: Partial<RoomSetupShared>) => void
  settings: RoomSetupShared
}

export default function SharedSettings({ onChange, settings }: Props) {
  return (
    <VStack spacing={4} w="100%">
      <FormControl>
        <FormLabel htmlFor="title">Title</FormLabel>
        <Input
          value={settings.title}
          placeholder="Room Title"
          name="title"
          onChange={(e) => {
            onChange({ title: e.target.value })
          }}
        />
      </FormControl>
    </VStack>
  )
}

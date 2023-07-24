import React from "react"
import {
  FormControl,
  VStack,
  Input,
  FormLabel,
  FormHelperText,
} from "@chakra-ui/react"

import { RoomSetup } from "../../types/Room"

type Props = {
  onChange: (settings: Partial<RoomSetup>) => void
  settings: RoomSetup
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
        <FormHelperText>You can change this later</FormHelperText>
      </FormControl>
    </VStack>
  )
}

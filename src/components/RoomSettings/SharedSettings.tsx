import React from "react"
import {
  FormControl,
  VStack,
  Input,
  FormLabel,
  FormHelperText,
  Checkbox,
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
      <FormControl>
        <Checkbox
          isChecked={settings.deputizeOnJoin}
          onChange={(e) => {
            onChange({ deputizeOnJoin: e.target.checked })
          }}
          checked={settings.deputizeOnJoin}
          name="deputizeOnJoin"
        >
          Auto-deputize guests as DJs
        </Checkbox>
        <FormHelperText>
          When enabled, anyone who joins the room will be deputized as a DJ,
          allowing them to add to your queue. When disabled, you can explicitly
          grant this permission to individuals.
        </FormHelperText>
      </FormControl>
    </VStack>
  )
}

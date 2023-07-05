import {
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  VStack,
} from "@chakra-ui/react"
import React from "react"

import { Room } from "../../types/Room"

type Props = {
  onChange: (settings: Partial<Room>) => void
}

export default function FormRadioSettings({ onChange }: Props) {
  return (
    <VStack spacing={4} w="100%">
      <FormControl>
        <FormLabel htmlFor="radioUrl">Radio URL</FormLabel>
        <Input
          name="radioUrl"
          placeholder="Radio URL"
          onChange={(e) => {
            onChange({ radioUrl: e.target.value })
          }}
        />
        <FormHelperText>
          The base URL of the SHOUTCast server you want to connect to.
        </FormHelperText>
      </FormControl>
    </VStack>
  )
}

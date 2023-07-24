import {
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Select,
  VStack,
} from "@chakra-ui/react"
import React from "react"

import { Room } from "../../types/Room"
import { StationProtocol } from "../../types/StationProtocol"

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
      <FormControl>
        <FormLabel htmlFor="radioProtocol">Radio Protocol</FormLabel>
        <Select
          name="radioProtocol"
          onChange={(e) =>
            onChange({ radioProtocol: e.target.value as StationProtocol })
          }
        >
          <option value="shoutcastv2">Shoutcast v2</option>
          <option value="shoutcastv1">Shoutcast v1</option>
          <option value="icecast">Icecast</option>
          <option value="raw">Raw Stream (icy data)</option>
        </Select>
        <FormHelperText>
          The base URL of the SHOUTCast server you want to connect to.
        </FormHelperText>
      </FormControl>
    </VStack>
  )
}

import {
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Select,
  VStack,
  Text,
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
        <FormLabel htmlFor="radioMetaUrl">Radio URL</FormLabel>
        <Input
          name="radioMetaUrl"
          placeholder="Radio URL"
          onChange={(e) => {
            onChange({ radioListenUrl: e.target.value })
          }}
        />
        <FormHelperText>
          The base URL of the SHOUTCast server you want to connect to.{" "}
          <Text as="strong" fontWeight={600}>
            Needs to be a direct stream HTTPS URL.
          </Text>
        </FormHelperText>
      </FormControl>
      <FormControl>
        <FormLabel>Radio Metadata URL</FormLabel>
        <Input
          name="radioMetaUrl"
          placeholder="Radio Metadata URL"
          onChange={(e) => {
            onChange({ radioMetaUrl: e.target.value })
          }}
        />
        <FormHelperText>
          The URL of the internet radio station's metadata endpoint.
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

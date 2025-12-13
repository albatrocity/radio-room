import { Field, Input, NativeSelect, VStack, Text } from "@chakra-ui/react"
import React from "react"

import { Room } from "../../types/Room"
import { StationProtocol } from "../../types/StationProtocol"

type Props = {
  onChange: (settings: Partial<Room>) => void
  settings?: Partial<Room>
}

export default function FormRadioSettings({ onChange, settings }: Props) {
  return (
    <VStack gap={4} w="100%">
      <Field.Root>
        <Field.Label htmlFor="radioListenUrl">Radio URL</Field.Label>
        <Input
          name="radioListenUrl"
          placeholder="Radio URL"
          defaultValue={settings?.radioListenUrl}
          onChange={(e) => {
            onChange({ radioListenUrl: e.target.value })
          }}
        />
        <Field.HelperText>
          The base URL of the SHOUTCast server you want to connect to.{" "}
          <Text as="strong" fontWeight={600}>
            Needs to be a direct stream HTTPS URL.
          </Text>
        </Field.HelperText>
      </Field.Root>
      <Field.Root>
        <Field.Label htmlFor="radioMetaUrl">Radio Metadata URL</Field.Label>
        <Input
          name="radioMetaUrl"
          placeholder="Radio Metadata URL"
          defaultValue={settings?.radioMetaUrl}
          onChange={(e) => {
            onChange({ radioMetaUrl: e.target.value })
          }}
        />
        <Field.HelperText>
          The URL of the internet radio station's metadata endpoint.
        </Field.HelperText>
      </Field.Root>
      <Field.Root>
        <Field.Label htmlFor="radioProtocol">Radio Protocol</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field
            name="radioProtocol"
            defaultValue={settings?.radioProtocol ?? "shoutcastv2"}
            onChange={(e) => onChange({ radioProtocol: e.target.value as StationProtocol })}
          >
            <option value="shoutcastv2">Shoutcast v2</option>
            <option value="shoutcastv1">Shoutcast v1</option>
            <option value="icecast">Icecast</option>
            <option value="raw">Raw Stream (icy data)</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Field.HelperText>The protocol used by the internet radio station.</Field.HelperText>
      </Field.Root>
    </VStack>
  )
}

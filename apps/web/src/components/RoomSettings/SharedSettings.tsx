import React from "react"
import {
  Field,
  VStack,
  Input,
  Checkbox,
} from "@chakra-ui/react"

import { RoomSetup } from "../../types/Room"

type Props = {
  onChange: (settings: Partial<RoomSetup>) => void
  settings: RoomSetup
}

export default function SharedSettings({ onChange, settings }: Props) {
  return (
    <VStack gap={4} w="100%">
      <Field.Root>
        <Field.Label htmlFor="title">Title</Field.Label>
        <Input
          value={settings.title}
          placeholder="Room Title"
          name="title"
          onChange={(e) => {
            onChange({ title: e.target.value })
          }}
        />
        <Field.HelperText>You can change this later</Field.HelperText>
      </Field.Root>
      <Field.Root>
        <Checkbox.Root
          checked={settings.deputizeOnJoin}
          onCheckedChange={(details) => {
            onChange({ deputizeOnJoin: !!details.checked })
          }}
          name="deputizeOnJoin"
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Label>Auto-deputize guests as DJs</Checkbox.Label>
        </Checkbox.Root>
        <Field.HelperText>
          When enabled, anyone who joins the room will be deputized as a DJ,
          allowing them to add to your queue. When disabled, you can explicitly
          grant this permission to individuals.
        </Field.HelperText>
      </Field.Root>
    </VStack>
  )
}

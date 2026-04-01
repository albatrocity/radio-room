import { useMemo } from "react"
import { Box, Field, RadioGroup, Text, VStack } from "@chakra-ui/react"
import type { SegmentRoomSettingsOverride } from "@repo/types"
import {
  type DeputyBulkTriState,
  type RoomSettingOverrideKey,
  type RoomSettingTriState,
  buildOverrideFromTriStates,
  overrideToAllTriStates,
  overrideToDeputyBulkTriState,
} from "../../lib/segmentRoomSettingsTriState"

export interface SegmentRoomSettingsEditorProps {
  value: SegmentRoomSettingsOverride | null
  onChange: (next: SegmentRoomSettingsOverride | null) => void
}

const ROWS: {
  key: RoomSettingOverrideKey
  label: string
  helper: string
}[] = [
  {
    key: "deputizeOnJoin",
    label: "Auto-deputize users",
    helper:
      "When enabled, users will be automatically deputized as DJs when they join. You can still revoke DJ access as normal.",
  },
  {
    key: "showQueueCount",
    label: "Show queue count",
    helper: 'Display the number of songs in the queue on the "Add to queue" button.',
  },
  {
    key: "showQueueTracks",
    label: "Show queued tracks",
    helper: "Display the list of upcoming queued tracks in the playlist drawer.",
  },
  {
    key: "fetchMeta",
    label: "Fetch album metadata",
    helper:
      "Album metadata (album artwork, release date, info URL) can be enriched from Spotify using data from the stream. Disable if you prefer metadata only from the radio source.",
  },
]

function DeputyBulkRadios(props: {
  value: DeputyBulkTriState
  onValueChange: (next: DeputyBulkTriState) => void
}) {
  const { value, onValueChange } = props
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(d) => onValueChange(d.value as DeputyBulkTriState)}
      size="sm"
    >
      <VStack align="stretch" gap={1}>
        <RadioGroup.Item value="unchanged">
          <RadioGroup.ItemHiddenInput />
          <RadioGroup.ItemControl />
          <RadioGroup.ItemText>Unchanged</RadioGroup.ItemText>
        </RadioGroup.Item>
        <RadioGroup.Item value="dedeputize_all">
          <RadioGroup.ItemHiddenInput />
          <RadioGroup.ItemControl />
          <RadioGroup.ItemText>De-deputize all users</RadioGroup.ItemText>
        </RadioGroup.Item>
        <RadioGroup.Item value="deputize_all">
          <RadioGroup.ItemHiddenInput />
          <RadioGroup.ItemControl />
          <RadioGroup.ItemText>Deputize all users</RadioGroup.ItemText>
        </RadioGroup.Item>
      </VStack>
    </RadioGroup.Root>
  )
}

function TriStateRadios(props: {
  value: RoomSettingTriState
  onValueChange: (next: RoomSettingTriState) => void
}) {
  const { value, onValueChange } = props
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(d) => onValueChange(d.value as RoomSettingTriState)}
      size="sm"
    >
      <VStack align="stretch" gap={1}>
        <RadioGroup.Item value="unchanged">
          <RadioGroup.ItemHiddenInput />
          <RadioGroup.ItemControl />
          <RadioGroup.ItemText>Unchanged</RadioGroup.ItemText>
        </RadioGroup.Item>
        <RadioGroup.Item value="true">
          <RadioGroup.ItemHiddenInput />
          <RadioGroup.ItemControl />
          <RadioGroup.ItemText>True</RadioGroup.ItemText>
        </RadioGroup.Item>
        <RadioGroup.Item value="false">
          <RadioGroup.ItemHiddenInput />
          <RadioGroup.ItemControl />
          <RadioGroup.ItemText>False</RadioGroup.ItemText>
        </RadioGroup.Item>
      </VStack>
    </RadioGroup.Root>
  )
}

export function SegmentRoomSettingsEditor({ value, onChange }: SegmentRoomSettingsEditorProps) {
  const triStates = useMemo(() => overrideToAllTriStates(value), [value])
  const deputyBulk = useMemo(() => overrideToDeputyBulkTriState(value), [value])

  const setKey = (key: RoomSettingOverrideKey, next: RoomSettingTriState) => {
    const nextStates = { ...triStates, [key]: next }
    onChange(buildOverrideFromTriStates(nextStates, deputyBulk))
  }

  const setDeputyBulk = (next: DeputyBulkTriState) => {
    onChange(buildOverrideFromTriStates(triStates, next))
  }

  return (
    <Box>
      <Box mb={1} fontSize="sm" fontWeight="medium">
        Room settings when activated (optional)
      </Box>
      <Text fontSize="xs" color="fg.muted" mb={3}>
        When this segment is activated in a listening room, these values overwrite the matching room
        settings. Unchanged leaves that setting as-is on the room.
      </Text>
      <VStack align="stretch" gap={5}>
        {ROWS.map((row) => (
          <Field.Root key={row.key}>
            <Field.Label fontSize="sm" fontWeight="medium">
              {row.label}
            </Field.Label>
            <TriStateRadios value={triStates[row.key]} onValueChange={(v) => setKey(row.key, v)} />
            <Field.HelperText fontSize="xs">{row.helper}</Field.HelperText>
          </Field.Root>
        ))}

        <Field.Root>
          <Field.Label fontSize="sm" fontWeight="medium">
            Deputy DJs when activated
          </Field.Label>
          <DeputyBulkRadios value={deputyBulk} onValueChange={setDeputyBulk} />
          <Field.HelperText fontSize="xs">
            Optionally de-deputize everyone currently in the deputy DJ set, or deputize everyone
            currently online in the room. Unchanged does not modify deputy assignments.
          </Field.HelperText>
        </Field.Root>
      </VStack>
    </Box>
  )
}

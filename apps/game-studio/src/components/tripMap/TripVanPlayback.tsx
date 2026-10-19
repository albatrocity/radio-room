import { Checkbox, HStack, Text } from "@chakra-ui/react"
import { PHYSICAL_MEDIA_FORMATS, type PhysicalMediaFormat } from "@repo/types"
import type { TripMapInput } from "@repo/road-trip-map"
import { formatCheckLabel, updateVanPlayback } from "../../tripMap/tripMapDraft"

type Props = {
  draft: TripMapInput
  onChange: (draft: TripMapInput) => void
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Checkbox.Root size="sm" checked={checked} onCheckedChange={(d) => onChange(d.checked === true)}>
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label>{label}</Checkbox.Label>
    </Checkbox.Root>
  )
}

/** `tuning.vanPlayback`: the van is a playback device while the map is loaded (ADR 0215). */
export function TripVanPlayback({ draft, onChange }: Props) {
  const formats = draft.tuning?.vanPlayback?.formats ?? PHYSICAL_MEDIA_FORMATS
  const toggle = (format: PhysicalMediaFormat, checked: boolean) =>
    onChange(
      updateVanPlayback(draft, {
        formats: PHYSICAL_MEDIA_FORMATS.filter((f) => (f === format ? checked : formats.includes(f))),
      }),
    )
  return (
    <HStack gap="4" flexWrap="wrap">
      <Text fontSize="xs" color="fg.muted">
        Van plays:
      </Text>
      {PHYSICAL_MEDIA_FORMATS.map((format) => (
        <Check
          key={format}
          label={formatCheckLabel(format)}
          checked={formats.includes(format)}
          onChange={(checked) => toggle(format, checked)}
        />
      ))}
      <Check
        label="Van plays records without wear"
        checked={draft.tuning?.vanPlayback?.gentle === true}
        onChange={(gentle) => onChange(updateVanPlayback(draft, { gentle }))}
      />
    </HStack>
  )
}

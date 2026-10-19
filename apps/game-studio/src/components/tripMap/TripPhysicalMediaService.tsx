import { Checkbox, Field, HStack, Stack, TagsInput, Text } from "@chakra-ui/react"
import {
  normalizeGenres,
  PHYSICAL_MEDIA_FORMATS,
  type PhysicalMediaCarry,
  type PhysicalMediaFormat,
} from "@repo/types"
import { formatCheckLabel } from "../../tripMap/tripMapDraft"

type Props = {
  carry: PhysicalMediaCarry | undefined
  /** `undefined` turns the service off. */
  onChange: (carry: PhysicalMediaCarry | undefined) => void
}

const MAX_GENRES = 12
const MAX_GENRE_LENGTH = 60

/** "Sells physical media" under a site's Services: format checks and genre chips (ADR 0214). */
export function TripPhysicalMediaService({ carry, onChange }: Props) {
  const formats = carry?.formats ?? []
  const genres = carry?.genres ?? []

  const update = (next: PhysicalMediaCarry) =>
    onChange({
      ...(next.formats?.length ? { formats: next.formats } : {}),
      ...(next.genres?.length ? { genres: next.genres } : {}),
    })

  const toggleFormat = (format: PhysicalMediaFormat, checked: boolean) =>
    update({
      genres,
      formats: PHYSICAL_MEDIA_FORMATS.filter((f) =>
        f === format ? checked : formats.includes(f),
      ),
    })

  return (
    <Stack gap="2">
      <Checkbox.Root
        size="sm"
        checked={carry !== undefined}
        onCheckedChange={(d) => onChange(d.checked === true ? {} : undefined)}
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>Sells physical media</Checkbox.Label>
      </Checkbox.Root>
      {carry ? (
        <Stack gap="2" ps="6">
          <HStack gap="4" flexWrap="wrap">
            {PHYSICAL_MEDIA_FORMATS.map((format) => (
              <Checkbox.Root
                key={format}
                size="sm"
                checked={formats.includes(format)}
                onCheckedChange={(d) => toggleFormat(format, d.checked === true)}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label>{formatCheckLabel(format)}</Checkbox.Label>
              </Checkbox.Root>
            ))}
          </HStack>
          <Field.Root>
            <TagsInput.Root
              size="sm"
              max={MAX_GENRES}
              blurBehavior="add"
              validate={(d) => d.inputValue.trim().length <= MAX_GENRE_LENGTH}
              value={genres}
              onValueChange={(d) => update({ formats, genres: normalizeGenres(d.value) })}
            >
              <TagsInput.Label fontSize="xs">Genres</TagsInput.Label>
              <TagsInput.Control>
                <TagsInput.Items />
                <TagsInput.Input placeholder="Country, Jazz…" />
              </TagsInput.Control>
            </TagsInput.Root>
            <Field.HelperText fontSize="xs">
              Genres must match the album&apos;s Navidrome genre. No format or genre sells every
              record. Other goods go under Shop.
            </Field.HelperText>
          </Field.Root>
          {formats.length === 0 && genres.length === 0 ? (
            <Text fontSize="xs" color="fg.muted">
              Sells every record in the room&apos;s library.
            </Text>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  )
}

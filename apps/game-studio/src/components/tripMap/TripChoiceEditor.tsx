import {
  Box,
  Button,
  Field,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react"
import type { EventResolution, TripMapInput, TripOutcome } from "@repo/road-trip-map"
import { siteSlugFromName } from "../../tripMap/tripMapDraft"
import { TripOutcomesEditor } from "./TripBranchFields"

type Choice = Extract<EventResolution, { kind: "choice" }>
type Option = Choice["options"][number]

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function uniqueOptionId(choice: Choice, label: string): string {
  const base = siteSlugFromName(label) || "option"
  const taken = new Set(choice.options.map((o) => o.id))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/**
 * A room choice (ADR 0222): a question, 2–4 options whose outcomes apply when
 * they win, and the option that wins on a tie or no votes.
 */
export function TripChoiceEditor({
  draft,
  choice,
  onChange,
}: {
  draft: TripMapInput
  choice: Choice
  onChange: (choice: Choice) => void
}) {
  const setOption = (index: number, patch: Partial<Option>) =>
    onChange({
      ...choice,
      options: choice.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    })
  return (
    <Stack gap="2" mb="2">
      <SimpleGrid columns={{ base: 1, md: 3 }} gap="2">
        <Field.Root gridColumn={{ md: "span 2" }}>
          <Field.Label fontSize="xs">Question</Field.Label>
          <Input
            size="sm"
            maxLength={120}
            value={choice.question}
            onChange={(e) => onChange({ ...choice, question: e.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Vote seconds</Field.Label>
          <Input
            size="sm"
            type="number"
            placeholder="60"
            value={choice.seconds ?? ""}
            onChange={(e) => {
              const seconds = optionalNumber(e.target.value)
              const { seconds: _drop, ...rest } = choice
              onChange(seconds === undefined ? rest : { ...rest, seconds })
            }}
          />
        </Field.Root>
      </SimpleGrid>
      <Field.Root>
        <Field.Label fontSize="xs">Tie or no votes =</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            value={choice.default}
            onChange={(e) => onChange({ ...choice, default: e.target.value })}
          >
            {choice.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>
      {choice.options.map((option, index) => (
        <Box key={option.id} borderWidth="1px" borderRadius="md" p="2">
          <HStack gap="2" align="end" mb="2">
            <Field.Root flex="1">
              <Field.Label fontSize="xs">Option {index + 1}</Field.Label>
              <Input
                size="sm"
                maxLength={60}
                value={option.label}
                onChange={(e) => setOption(index, { label: e.target.value })}
              />
            </Field.Root>
            <Field.Root flex="1">
              <Field.Label fontSize="xs">Narrative when it wins</Field.Label>
              <Input
                size="sm"
                maxLength={2000}
                value={option.narrative ?? ""}
                onChange={(e) => setOption(index, { narrative: e.target.value || undefined })}
              />
            </Field.Root>
            <Button
              size="xs"
              variant="ghost"
              colorPalette="red"
              disabled={choice.options.length <= 2}
              onClick={() => {
                const options = choice.options.filter((_, i) => i !== index)
                onChange({
                  ...choice,
                  options,
                  default: choice.default === option.id ? options[0]!.id : choice.default,
                })
              }}
            >
              Remove
            </Button>
          </HStack>
          <TripOutcomesEditor
            draft={draft}
            label="Outcomes"
            helper="Applied when this option wins."
            outcomes={(option.outcomes ?? []) as TripOutcome[]}
            onChange={(outcomes) => setOption(index, { outcomes: outcomes ?? [] })}
          />
        </Box>
      ))}
      <Button
        size="xs"
        variant="subtle"
        alignSelf="start"
        disabled={choice.options.length >= 4}
        onClick={() => {
          const label = `Option ${choice.options.length + 1}`
          onChange({
            ...choice,
            options: [
              ...choice.options,
              { id: uniqueOptionId(choice, label), label, outcomes: [] },
            ],
          })
        }}
      >
        + Option
      </Button>
      <Text fontSize="xs" color="fg.muted">
        On a stop the van waits while the room votes; a slowdown keeps crawling until both its time
        and the vote are up; with no effect the van keeps driving.
      </Text>
    </Stack>
  )
}

"use client"

import { Input, Stack, Text, Textarea } from "@chakra-ui/react"
import { STASH_LABEL_MAX_CHARS, STASH_NOTE_MAX_CHARS } from "@repo/game-logic"

export function StashPublicFields({
  label,
  note,
  onLabelChange,
  onNoteChange,
}: {
  label: string
  note: string
  onLabelChange: (value: string) => void
  onNoteChange: (value: string) => void
}) {
  return (
    <Stack gap={2}>
      <Stack gap={1}>
        <Input
          placeholder="Name (optional)"
          value={label}
          maxLength={STASH_LABEL_MAX_CHARS}
          onChange={(e) => onLabelChange(e.target.value)}
        />
        <Text fontSize="2xs" color="fg.muted">
          Everyone can see this · {label.length}/{STASH_LABEL_MAX_CHARS}
        </Text>
      </Stack>
      <Stack gap={1}>
        <Textarea
          placeholder="Note — typically a password hint (optional)"
          value={note}
          maxLength={STASH_NOTE_MAX_CHARS}
          rows={2}
          onChange={(e) => onNoteChange(e.target.value)}
        />
        <Text fontSize="2xs" color="fg.muted">
          Everyone can see this · {note.length}/{STASH_NOTE_MAX_CHARS}
        </Text>
      </Stack>
    </Stack>
  )
}

"use client"

import { Button, NativeSelect, Popover, Stack, Text, Textarea } from "@chakra-ui/react"
import { useState } from "react"

const SAY_MAX_CHARS = 100

const STUDIO_VOICES = [
  { id: "Samantha", name: "Samantha" },
  { id: "Zarvox", name: "Zarvox" },
  { id: "Whisper", name: "Whisper" },
] as const

type Props = {
  onConfirm: (message: string, voice: string) => void
  children: React.ReactNode
}

/**
 * Message + voice for Burner Phone in Game Studio (stub voices; ADR 0178).
 */
export function StudioSpokenMessagePopover({ onConfirm, children }: Props) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [voice, setVoice] = useState<string>(STUDIO_VOICES[0].id)

  const reset = () => {
    setMessage("")
    setVoice(STUDIO_VOICES[0].id)
  }

  const handleOpenChange = (e: { open: boolean }) => {
    setOpen(e.open)
    if (!e.open) reset()
  }

  const codePoints = [...message].length
  const trimmed = message.trim()
  const canSubmit = trimmed.length > 0 && codePoints <= SAY_MAX_CHARS && voice.length > 0

  const submit = () => {
    if (!canSubmit) return
    const msg = trimmed
    const v = voice
    setOpen(false)
    reset()
    onConfirm(msg, v)
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange} lazyMount>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content minW="260px" p={3}>
          <Stack gap={2}>
            <Text fontSize="sm" fontWeight="semibold">
              Message ({codePoints}/{SAY_MAX_CHARS})
            </Text>
            <Textarea
              size="sm"
              rows={3}
              value={message}
              onChange={(e) => {
                const next = e.target.value
                if ([...next].length <= SAY_MAX_CHARS) setMessage(next)
                else setMessage([...next].slice(0, SAY_MAX_CHARS).join(""))
              }}
            />
            <Text fontSize="sm" fontWeight="semibold">
              Voice
            </Text>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field value={voice} onChange={(e) => setVoice(e.currentTarget.value)}>
                {STUDIO_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            <Button size="xs" onClick={submit} disabled={!canSubmit}>
              Put call through
            </Button>
          </Stack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

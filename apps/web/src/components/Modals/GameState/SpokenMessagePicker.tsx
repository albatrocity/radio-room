import { useEffect, useId, useState } from "react"
import { Button, NativeSelect, Popover, Stack, Text, Textarea } from "@chakra-ui/react"
import { emitToSocket } from "../../../actors/socketActor"
import { subscribeForSocketResult } from "../../../lib/subscribeForSocketResult"

/** Keep in sync with `BRIDGE_SAY_MAX_CHARS` in `@repo/adapter-bridge` (ADR 0178). */
const SAY_MAX_CHARS = 100

type SayVoice = { id: string; name: string; locale: string }

/**
 * Message + macOS voice picker for Burner Phone / Media Bridge TTS (ADR 0178).
 */
export function SpokenMessagePopover({
  children,
  onConfirm,
}: {
  children: React.ReactNode
  onConfirm: (message: string, voice: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [voice, setVoice] = useState("")
  const [voices, setVoices] = useState<SayVoice[]>([])
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [voicesError, setVoicesError] = useState<string | null>(null)
  const subId = useId()

  const reset = () => {
    setMessage("")
    setVoice("")
    setVoicesError(null)
  }

  const handleOpenChange = (e: { open: boolean }) => {
    setOpen(e.open)
    if (!e.open) reset()
  }

  useEffect(() => {
    if (!open) return
    setLoadingVoices(true)
    setVoicesError(null)
    setVoices([])
    setVoice("")
    const cancel = subscribeForSocketResult<{
      voices?: SayVoice[]
      error?: string
    }>({
      id: `say-voices-${subId}`,
      eventType: "MEDIA_BRIDGE_SAY_VOICES_RESULT",
      toastTimeout: false,
      onResult: (data) => {
        setLoadingVoices(false)
        const list = Array.isArray(data.voices) ? data.voices : []
        setVoices(list)
        if (data.error || list.length === 0) {
          setVoicesError(data.error || "The line is dead — the DJ Mac isn’t linked.")
          return
        }
        setVoice(list[0]?.id ?? "")
      },
      onTimeout: () => {
        setLoadingVoices(false)
        setVoicesError("The line is dead — the DJ Mac isn’t linked.")
      },
    })
    emitToSocket("GET_MEDIA_BRIDGE_SAY_VOICES", {})
    return cancel
  }, [open, subId])

  const codePoints = [...message].length
  const trimmed = message.trim()
  const canSubmit =
    !loadingVoices &&
    !voicesError &&
    voice.length > 0 &&
    trimmed.length > 0 &&
    codePoints <= SAY_MAX_CHARS

  const submit = () => {
    if (!canSubmit) return
    const msg = trimmed
    const v = voice
    setOpen(false)
    reset()
    onConfirm(msg, v)
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={handleOpenChange}
      lazyMount
      portalled={false}
      positioning={{ placement: "bottom-end", strategy: "fixed" }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content css={{ "--popover-bg": "{colors.appBg}" }} minW="280px" p={3}>
          <Stack gap={2}>
            <Text fontSize="sm" fontWeight="semibold">
              Message ({codePoints}/{SAY_MAX_CHARS})
            </Text>
            <Textarea
              size="sm"
              rows={3}
              placeholder="What should they hear?"
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
            {loadingVoices ? (
              <Text fontSize="xs" color="fg.muted">
                Dialing the DJ Mac…
              </Text>
            ) : voicesError ? (
              <Text fontSize="xs" color="fg.error">
                {voicesError}
              </Text>
            ) : (
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  value={voice}
                  onChange={(e) => setVoice(e.currentTarget.value)}
                >
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.locale ? ` (${v.locale})` : ""}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            )}
            <Button
              size="xs"
              colorPalette="action"
              onClick={submit}
              disabled={!canSubmit}
            >
              Put call through
            </Button>
          </Stack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

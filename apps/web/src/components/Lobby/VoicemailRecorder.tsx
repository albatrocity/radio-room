import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Box,
  Button,
  CloseButton,
  Field,
  HStack,
  Icon,
  Input,
  Popover,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Mic } from "lucide-react"
import { HTTPError } from "ky"

import { VOICEMAIL_LABEL_MAX_CHARS } from "@repo/types"

import { completeVoicemail, presignVoicemail } from "../../lib/serverApi"
import {
  VOICEMAIL_HARD_STOP_MS,
  isMediaRecorderSupported,
  pickRecorderMime,
  startVoicemailRecording,
  type RecordingController,
  type VoicemailRecording,
} from "../../lib/voicemailRecorderPipeline"
// `?url` gives Vite the hashed asset URL for `audioWorklet.addModule()`.
// The worklet is classic JS (no ES import/export) so the browser can run it
// in the AudioWorklet global scope.
import workletUrl from "../../lib/voicemailTelephoneWorklet.js?url"

type Stage =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "recording"; elapsedMs: number }
  | { kind: "review"; recording: VoicemailRecording }
  | { kind: "uploading"; recording: VoicemailRecording }
  | { kind: "sent" }

const GENERIC_ERROR = "Something went wrong. Please try again."

async function uploadErrorMessage(error: unknown): Promise<string> {
  if (error instanceof HTTPError) {
    try {
      const body = (await error.response.json()) as { error?: string }
      if (body.error) return body.error
    } catch {
      /* fall through */
    }
  }
  if (error instanceof Error && error.message) return error.message
  return GENERIC_ERROR
}

function formatRemaining(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * Anonymous lobby voicemail recorder (ADR 0212, plan phase 3).
 *
 * Local state machine: idle → requesting → recording → review → uploading → sent.
 * Re-record drops the blob and goes back to idle without hitting the API,
 * so it never spends a presign/complete rate-limit slot. The telephone band
 * pass and WebM duration fix live in voicemailRecorderPipeline.ts; this
 * component only drives the UI and the three network calls (presign, PUT,
 * complete).
 */
export function VoicemailRecorder() {
  const supported = useMemo(
    () => isMediaRecorderSupported() && pickRecorderMime() !== null,
    [],
  )

  const [stage, setStage] = useState<Stage>({ kind: "idle" })
  const [label, setLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const controllerRef = useRef<RecordingController | null>(null)
  const recordingRef = useRef<VoicemailRecording | null>(null)
  const unmountedRef = useRef(false)

  const revokeRecording = useCallback(() => {
    const rec = recordingRef.current
    if (rec) {
      URL.revokeObjectURL(rec.objectUrl)
      recordingRef.current = null
    }
  }, [])

  // Unmount cleanup: cancel any in-flight take and revoke any object URL.
  // Reset the flag on mount — React Strict Mode runs cleanup then remounts,
  // and leaving `unmountedRef` true forever made Record stick on
  // "Starting microphone…" after getUserMedia succeeded.
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      controllerRef.current?.cancel()
      controllerRef.current = null
      revokeRecording()
    }
  }, [revokeRecording])

  // 1 Hz countdown while recording.
  useEffect(() => {
    if (stage.kind !== "recording") return
    const startedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now()
    const id = window.setInterval(() => {
      if (unmountedRef.current) return
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now()
      const elapsedMs = Math.round(now - startedAt)
      setStage((prev) =>
        prev.kind === "recording" ? { kind: "recording", elapsedMs } : prev,
      )
    }, 250)
    return () => window.clearInterval(id)
  }, [stage.kind])

  const awaitFinished = useCallback(async (controller: RecordingController) => {
    try {
      const recording = await controller.finished
      if (unmountedRef.current) {
        URL.revokeObjectURL(recording.objectUrl)
        return
      }
      recordingRef.current = recording
      setStage({ kind: "review", recording })
    } catch (err) {
      if (unmountedRef.current) return
      // Cancelled or error — go back to idle, the UI is re-usable.
      if (!(err instanceof Error) || err.message !== "Recording cancelled") {
        setError(err instanceof Error ? err.message : GENERIC_ERROR)
      }
      setStage({ kind: "idle" })
    } finally {
      controllerRef.current = null
    }
  }, [])

  const handleStart = useCallback(async () => {
    if (stage.kind !== "idle") return
    const mime = pickRecorderMime()
    if (!mime) return
    setError(null)
    setStage({ kind: "requesting" })

    try {
      const controller = await startVoicemailRecording({
        workletUrl,
        mime,
        onUnexpectedEnd: () => {
          // Mic stream ended (device unplugged, permission revoked).
          // requestStop() flushes whatever we have; awaitFinished does the
          // rest (error → back to idle, or review → regular review flow).
          controllerRef.current?.requestStop()
        },
      })
      if (unmountedRef.current) {
        controller.cancel()
        return
      }
      controllerRef.current = controller
      setStage({ kind: "recording", elapsedMs: 0 })

      // Always await finished so a 2-minute hard-stop (or an unexpected mic
      // end) ends up on the review step the same way a manual Stop does.
      void awaitFinished(controller)
    } catch (err) {
      if (unmountedRef.current) return
      // getUserMedia / AudioContext / worklet failure. Most common: the user
      // denied mic permission.
      const message =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : err instanceof Error
            ? err.message
            : GENERIC_ERROR
      setError(message)
      setStage({ kind: "idle" })
    }
  }, [awaitFinished, stage.kind])

  const handleStop = useCallback(() => {
    if (stage.kind !== "recording") return
    controllerRef.current?.requestStop()
    // awaitFinished (kicked off in handleStart) is already waiting on the
    // final blob; it will move us to the review state.
  }, [stage.kind])

  const handleReRecord = useCallback(() => {
    if (stage.kind !== "review") return
    revokeRecording()
    setLabel("")
    setError(null)
    setStage({ kind: "idle" })
  }, [revokeRecording, stage.kind])

  const handleSend = useCallback(async () => {
    if (stage.kind !== "review") return
    const recording = stage.recording
    setError(null)
    setStage({ kind: "uploading", recording })

    try {
      const presign = await presignVoicemail({
        contentType: recording.contentType,
        contentLength: recording.blob.size,
        durationMs: recording.durationMs,
        label: label.trim() ? label.trim() : null,
      })

      // S3 requires the exact signed Content-Type and Content-Length. We use
      // whatever the server echoed back (base MIME only, no codecs). `fetch`
      // sets Content-Length from the body automatically.
      const putResponse = await fetch(presign.url, {
        method: "PUT",
        headers: { "Content-Type": presign.contentType },
        body: recording.blob,
      })
      if (!putResponse.ok) {
        throw new Error(`Upload failed (${putResponse.status})`)
      }

      await completeVoicemail({ uploadId: presign.uploadId })

      if (unmountedRef.current) return
      revokeRecording()
      setStage({ kind: "sent" })
    } catch (err) {
      if (unmountedRef.current) return
      const message = await uploadErrorMessage(err)
      setError(message)
      // Stay on review with the same take so the caller can retry without
      // recording again. The pipeline blob is still alive.
      setStage({ kind: "review", recording })
    }
  }, [label, revokeRecording, stage])

  const dismissPopover = useCallback(() => {
    if (stage.kind === "uploading") return
    if (stage.kind === "requesting" || stage.kind === "recording") {
      controllerRef.current?.cancel()
      setStage({ kind: "idle" })
    }
    if (stage.kind === "sent") {
      setLabel("")
      setError(null)
      setStage({ kind: "idle" })
    }
    setOpen(false)
  }, [stage.kind])

  if (!supported) {
    return (
      <Box textAlign="center" color="colorPalette.contrast">
        <Text fontSize="sm">
          This browser can&apos;t record audio. Try a recent Chrome, Safari, or Firefox.
        </Text>
      </Box>
    )
  }

  return (
    <HStack justify="center">
      <Popover.Root
        open={open}
        onOpenChange={(details) => {
          if (details.open) {
            setOpen(true)
            return
          }
          dismissPopover()
        }}
        positioning={{ placement: "top" }}
        lazyMount
      >
        <Popover.Trigger asChild>
          <Button size="sm" colorPalette="action">
            <Icon as={Mic} />
            Record a voicemail
          </Button>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content
              colorPalette="action"
              css={{ "--popover-bg": "{colors.appBg}" }}
              w="320px"
            >
              <Popover.Arrow />
              <Popover.CloseTrigger asChild position="absolute" top="1" right="1">
                <CloseButton size="sm" />
              </Popover.CloseTrigger>
              <Popover.Body pt={8}>
                <VStack gap={3} align="stretch">
                  {stage.kind === "idle" && (
                    <>
                      <Text fontSize="sm" textAlign="center">
                        Leave a voicemail for the next show. Anonymous, up to two minutes.
                      </Text>
                      <HStack justify="center">
                        <Button size="sm" colorPalette="action" onClick={handleStart}>
                          Record
                        </Button>
                      </HStack>
                      {error && (
                        <Text fontSize="xs" color="fg.error" textAlign="center">
                          {error}
                        </Text>
                      )}
                    </>
                  )}

                  {stage.kind === "requesting" && (
                    <Text fontSize="sm" textAlign="center">
                      Starting microphone…
                    </Text>
                  )}

                  {stage.kind === "recording" && (
                    <VStack gap={2}>
                      <Text fontSize="sm">
                        Recording — {formatRemaining(VOICEMAIL_HARD_STOP_MS - stage.elapsedMs)} left
                      </Text>
                      <Button size="sm" colorPalette="red" onClick={handleStop}>
                        Stop
                      </Button>
                    </VStack>
                  )}

                  {stage.kind === "review" && (
                    <VStack gap={3} align="stretch">
                      <Text fontSize="sm" textAlign="center">
                        Have a listen. Send it when you&apos;re happy with it.
                      </Text>
                      <audio controls src={stage.recording.objectUrl} style={{ width: "100%" }} />
                      <Field.Root>
                        <Field.Label fontSize="xs">
                          Name (optional, up to {VOICEMAIL_LABEL_MAX_CHARS} characters)
                        </Field.Label>
                        <Input
                          size="sm"
                          value={label}
                          onChange={(e) =>
                            setLabel(e.target.value.slice(0, VOICEMAIL_LABEL_MAX_CHARS))
                          }
                          maxLength={VOICEMAIL_LABEL_MAX_CHARS}
                          placeholder="Anonymous"
                        />
                      </Field.Root>
                      {error && (
                        <Text fontSize="xs" color="fg.error" textAlign="center">
                          {error}
                        </Text>
                      )}
                      <HStack justify="center" gap={2}>
                        <Button size="sm" variant="outline" onClick={handleReRecord}>
                          Re-record
                        </Button>
                        <Button size="sm" colorPalette="action" onClick={handleSend}>
                          Send
                        </Button>
                      </HStack>
                    </VStack>
                  )}

                  {stage.kind === "uploading" && (
                    <VStack gap={3} align="stretch">
                      <Text fontSize="sm" textAlign="center">
                        Sending…
                      </Text>
                      <audio controls src={stage.recording.objectUrl} style={{ width: "100%" }} />
                      <HStack justify="center" gap={2}>
                        <Button size="sm" variant="outline" disabled>
                          Re-record
                        </Button>
                        <Button size="sm" colorPalette="action" loading>
                          Send
                        </Button>
                      </HStack>
                    </VStack>
                  )}

                  {stage.kind === "sent" && (
                    <Text fontSize="sm" textAlign="center">
                      Thanks! We got it.
                    </Text>
                  )}
                </VStack>
              </Popover.Body>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    </HStack>
  )
}

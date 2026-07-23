import React, { useMemo, useRef } from "react"
import {
  Button,
  CloseButton,
  Dialog,
  Field,
  HStack,
  Portal,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMachine } from "@xstate/react"
import type { ConfigImportMode, PluginActionElement } from "@repo/types/Plugin"
import { configImportMachine } from "./configImportMachine"

export type ApplyConfigImportFn = (args: {
  action: string
  rawText: string
  mode: ConfigImportMode
  existingValue: unknown
}) => Promise<{ success: boolean; value?: unknown; message?: string }>

export interface ConfigImportActionButtonProps {
  element: PluginActionElement
  /** Current value of `configImport.targetField` (for merge + replace confirm). */
  existingValue: unknown
  applyConfigImport: ApplyConfigImportFn
  onApplied: (targetField: string, value: unknown, message?: string) => void
  onError?: (message: string) => void
}

function modeLabel(mode: ConfigImportMode, itemNoun: string): string {
  if (mode === "replace") return `Replace ${itemNoun}`
  return `Append ${itemNoun}`
}

/**
 * Schema-driven import dialog for `configImport` actions (ADR 0075).
 * Dialog/submit/confirm flow lives in {@link configImportMachine}; hosts supply apply.
 */
export function ConfigImportActionButton({
  element,
  existingValue,
  applyConfigImport,
  onApplied,
  onError,
}: ConfigImportActionButtonProps) {
  const configImport = element.configImport

  const onAppliedRef = useRef(onApplied)
  const onErrorRef = useRef(onError)
  onAppliedRef.current = onApplied
  onErrorRef.current = onError

  const machine = useMemo(
    () =>
      configImportMachine.provide({
        actions: {
          reportSuccess: ({ context }) => {
            if (!configImport || !context.lastResult) return
            onAppliedRef.current(
              configImport.targetField,
              context.lastResult.value,
              context.lastResult.message,
            )
          },
          reportError: ({ context }) => {
            if (!context.lastError) return
            onErrorRef.current?.(context.lastError)
          },
        },
      }),
    [configImport],
  )

  const [snapshot, send] = useMachine(machine)

  if (!configImport) return null

  const modes: ConfigImportMode[] = configImport.modes?.length ? configImport.modes : ["append"]
  const textareaField = element.formFields?.find((f) => f.type === "textarea")
  const itemNoun = element.action.toLowerCase().includes("question") ? "questions" : "items"
  const existingLen = Array.isArray(existingValue) ? existingValue.length : 0

  const buttonVariant = element.variant === "destructive" ? "outline" : element.variant || "solid"
  const buttonColorPalette = element.variant === "destructive" ? "red" : undefined

  const open = snapshot.matches("open") || snapshot.matches("submitting")
  const loading = snapshot.matches("submitting")
  const { rawText, confirmReplace } = snapshot.context

  const submit = (mode: ConfigImportMode) => {
    const text = snapshot.context.rawText
    send({
      type: "SUBMIT",
      mode,
      needsReplaceConfirm: mode === "replace" && existingLen > 0 && !confirmReplace,
      run: () =>
        applyConfigImport({
          action: element.action,
          rawText: text,
          mode,
          existingValue,
        }),
    })
  }

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        colorPalette={buttonColorPalette}
        onClick={() => send({ type: "OPEN" })}
      >
        {element.label}
      </Button>

      <Dialog.Root
        open={open}
        onOpenChange={(e) => {
          if (!e.open) send({ type: "CLOSE" })
        }}
        placement="center"
        scrollBehavior="inside"
        size="lg"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>{element.label}</Dialog.Title>
              </Dialog.Header>
              <Dialog.CloseTrigger asChild position="absolute" top="2" right="2">
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
              <Dialog.Body>
                <VStack align="stretch" gap={3}>
                  <Text fontSize="sm" color="fg.muted">
                    Paste blocks separated by a blank line. Question text first, then answers as{" "}
                    <Text as="span" fontFamily="mono">
                      - answer
                    </Text>{" "}
                    lines.
                  </Text>
                  <Field.Root>
                    <Field.Label fontSize="sm">{textareaField?.label ?? "Paste"}</Field.Label>
                    <Textarea
                      value={rawText}
                      onChange={(e) => send({ type: "SET_TEXT", rawText: e.target.value })}
                      placeholder={textareaField?.placeholder}
                      rows={textareaField?.rows ?? 14}
                      fontFamily="mono"
                      fontSize="sm"
                      disabled={loading}
                    />
                  </Field.Root>
                  {confirmReplace ? (
                    <Text fontSize="sm" color="fg.muted">
                      Replace all existing {itemNoun}? This cannot be undone from this dialog.
                    </Text>
                  ) : null}
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <HStack gap={2} justify="flex-end" width="100%" flexWrap="wrap">
                  {modes.map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      variant={mode === "replace" ? "outline" : "solid"}
                      colorPalette={mode === "replace" ? "red" : undefined}
                      loading={loading}
                      disabled={!rawText.trim() || loading}
                      onClick={() => submit(mode)}
                    >
                      {confirmReplace && mode === "replace"
                        ? "Confirm replace"
                        : modeLabel(mode, itemNoun)}
                    </Button>
                  ))}
                </HStack>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  )
}

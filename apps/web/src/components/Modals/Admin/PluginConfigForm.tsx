import React, { useState } from "react"
import {
  Button,
  CloseButton,
  Dialog,
  HStack,
  Popover,
  Portal,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { PluginConfigForm as SharedPluginConfigForm } from "@repo/plugin-config-ui"
import type { PluginConfigFormProps as SharedProps } from "@repo/plugin-config-ui"
import type {
  ConfigImportMode,
  PluginActionElement,
} from "@repo/types/Plugin"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { popoverInScrollContainer } from "../../../lib/popoverInScrollContainer"
import { useUsers } from "../../../hooks/useActors"
import {
  buildPluginFormState,
  collectPluginFormValues,
  emptyPluginFormState,
  PluginFormFields,
} from "../../PluginFormFields"
import { toaster } from "../../ui/toaster"

interface PluginConfigFormProps {
  schema: SharedProps["schema"]
  values: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
  allValues?: Record<string, unknown>
  pluginName?: string
  readOnlyFields?: string[]
}

function modeButtonLabel(mode: ConfigImportMode, itemNoun: string): string {
  return mode === "replace" ? `Replace ${itemNoun}` : `Append ${itemNoun}`
}

type PluginActionResultData = {
  success: boolean
  message?: string
  /** Field updates to apply to the open config form (e.g. after fill/import). */
  configPatch?: Record<string, unknown>
}

/**
 * App-specific action button. Runs plugin actions over the socket and reports via toaster —
 * the coupling that keeps this in `apps/web`. Injected into the shared renderer as `renderAction`.
 */
function ActionButton({
  element,
  pluginName,
  allValues,
  onConfigPatch,
}: {
  element: PluginActionElement
  pluginName: string
  allValues: Record<string, unknown>
  onConfigPatch?: (patch: Record<string, unknown>) => void
}) {
  const users = useUsers()
  const formFields = element.formFields
  const hasForm = !!formFields?.length
  const isConfigImport = !!element.configImport
  const hasTextarea = formFields?.some((f) => f.type === "textarea") ?? false
  const useDialog = isConfigImport || hasTextarea

  const [isLoading, setIsLoading] = useState(false)
  const [formPopoverOpen, setFormPopoverOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [confirmReplace, setConfirmReplace] = useState(false)
  const subscriptionIdRef = React.useRef<string | null>(null)
  const onConfigPatchRef = React.useRef(onConfigPatch)
  onConfigPatchRef.current = onConfigPatch

  const runAction = React.useCallback(
    (params?: Record<string, unknown>, onSuccess?: () => void) => {
      setIsLoading(true)
      const subscriptionId = `plugin-action-${element.action}-${Date.now()}`
      subscriptionIdRef.current = subscriptionId

      subscribeById(subscriptionId, {
        send: (event: { type: string; data?: PluginActionResultData }) => {
          if (event.type === "PLUGIN_ACTION_RESULT" && event.data) {
            setIsLoading(false)
            unsubscribeById(subscriptionId)
            subscriptionIdRef.current = null
            if (event.data.success) {
              toaster.create({
                title: "Success",
                description: event.data.message || "Action completed successfully",
                type: "success",
              })
              setFormPopoverOpen(false)
              setConfirmReplace(false)
              if (event.data.configPatch) {
                onConfigPatchRef.current?.(event.data.configPatch)
              }
              onSuccess?.()
            } else {
              toaster.create({
                title: "Error",
                description: event.data.message || "Action failed",
                type: "error",
              })
            }
          }
        },
      })

      emitToSocket("EXECUTE_PLUGIN_ACTION", {
        pluginName,
        action: element.action,
        ...(params != null && Object.keys(params).length > 0 ? { params } : {}),
      })

      setTimeout(() => {
        if (subscriptionIdRef.current === subscriptionId) {
          setIsLoading(false)
          unsubscribeById(subscriptionId)
          subscriptionIdRef.current = null
          toaster.create({ title: "Timeout", description: "Action timed out", type: "error" })
        }
      }, 10000)
    },
    [element.action, pluginName],
  )

  const collectFormParams = (): Record<string, unknown> | null => {
    const collected = collectPluginFormValues(formFields ?? [], formValues)
    if (!collected.ok) {
      toaster.create({
        title: collected.error.title,
        description: collected.error.description,
        type: "error",
      })
      return null
    }
    return collected.values
  }

  const submitForm = (mode?: ConfigImportMode) => {
    const params = collectFormParams()
    if (!params) return

    if (isConfigImport && mode) {
      if (mode === "replace" && !confirmReplace) {
        setConfirmReplace(true)
        return
      }
      params.mode = mode
    }

    runAction(params, () => {
      setFormValues(emptyPluginFormState(formFields ?? []))
      setConfirmReplace(false)
    })
  }

  const buttonVariant = element.variant === "destructive" ? "outline" : element.variant || "solid"
  const buttonColorPalette = element.variant === "destructive" ? "red" : undefined
  const modes: ConfigImportMode[] = element.configImport?.modes?.length
    ? element.configImport.modes
    : ["append"]
  const itemNoun = element.configImport?.itemNoun?.trim() || "items"
  const importHelpText = element.configImport?.helpText?.trim()

  const renderFormFields = () => (
    <PluginFormFields
      fields={formFields ?? []}
      values={formValues}
      users={users}
      onChange={(name, value) => {
        setFormValues((prev) => ({ ...prev, [name]: value }))
        setConfirmReplace(false)
      }}
    />
  )

  if (hasForm && formFields && useDialog) {
    return (
      <>
        <Button
          variant={buttonVariant}
          colorPalette={buttonColorPalette}
          loading={isLoading}
          onClick={() => {
            setFormValues(buildPluginFormState(formFields, allValues))
            setConfirmReplace(false)
            setFormPopoverOpen(true)
          }}
        >
          {element.label}
        </Button>
        <Dialog.Root
          open={formPopoverOpen}
          onOpenChange={(e) => {
            setFormPopoverOpen(e.open)
            if (!e.open) setConfirmReplace(false)
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
                <Dialog.CloseTrigger asChild>
                  <CloseButton />
                </Dialog.CloseTrigger>
                <Dialog.Body>
                  <VStack align="stretch" gap={3}>
                    {isConfigImport && importHelpText ? (
                      <Text fontSize="sm" color="fg.muted">
                        {importHelpText}
                      </Text>
                    ) : null}
                    {element.confirmMessage && !isConfigImport ? (
                      <Text fontSize="sm">{element.confirmMessage}</Text>
                    ) : null}
                    {renderFormFields()}
                    {confirmReplace ? (
                      <Text fontSize="sm" color="fg.muted">
                        Replace all existing {itemNoun}? This cannot be undone from this dialog.
                      </Text>
                    ) : null}
                  </VStack>
                </Dialog.Body>
                <Dialog.Footer>
                  <HStack gap={2} justify="flex-end" width="100%" flexWrap="wrap">
                    {isConfigImport
                      ? modes.map((mode) => (
                          <Button
                            key={mode}
                            variant={mode === "replace" ? "outline" : "solid"}
                            colorPalette={mode === "replace" ? "red" : undefined}
                            loading={isLoading}
                            onClick={() => submitForm(mode)}
                          >
                            {confirmReplace && mode === "replace"
                              ? "Confirm replace"
                              : modeButtonLabel(mode, itemNoun)}
                          </Button>
                        ))
                      : (
                          <Button
                            colorPalette={element.variant === "destructive" ? "red" : undefined}
                            onClick={() => submitForm()}
                            loading={isLoading}
                          >
                            {element.confirmText || "Run"}
                          </Button>
                        )}
                  </HStack>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      </>
    )
  }

  if (hasForm && formFields) {
    return (
      <Popover.Root
        {...popoverInScrollContainer}
        open={formPopoverOpen}
        onOpenChange={(e) => {
          setFormPopoverOpen(e.open)
          if (e.open && formFields?.length) {
            setFormValues(buildPluginFormState(formFields, allValues))
          }
        }}
      >
        <Popover.Trigger asChild>
          <Button variant={buttonVariant} colorPalette={buttonColorPalette} loading={isLoading}>
            {element.label}
          </Button>
        </Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content>
            <Popover.Arrow />
            <Popover.CloseTrigger asChild position="absolute" top="1" right="1">
              <CloseButton size="sm" />
            </Popover.CloseTrigger>
            <Popover.Body>
              <Stack gap={3}>
                {element.confirmMessage ? <Text fontSize="sm">{element.confirmMessage}</Text> : null}
                {renderFormFields()}
              </Stack>
            </Popover.Body>
            <Popover.Footer justifyContent="flex-end" display="flex">
              <Button
                colorPalette={element.variant === "destructive" ? "red" : undefined}
                onClick={() => submitForm()}
                loading={isLoading}
              >
                {element.confirmText || "Run"}
              </Button>
            </Popover.Footer>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    )
  }

  if (element.confirmMessage) {
    return (
      <Popover.Root {...popoverInScrollContainer}>
        <Popover.Trigger asChild>
          <Button variant={buttonVariant} colorPalette={buttonColorPalette} loading={isLoading}>
            {element.label}
          </Button>
        </Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content>
            <Popover.Arrow />
            <Popover.CloseTrigger asChild position="absolute" top="1" right="1">
              <CloseButton size="sm" />
            </Popover.CloseTrigger>
            <Popover.Body>
              <Text>{element.confirmMessage}</Text>
            </Popover.Body>
            <Popover.Footer justifyContent="flex-end" display="flex">
              <Button colorPalette="red" onClick={() => runAction()} loading={isLoading}>
                {element.confirmText || "Confirm"}
              </Button>
            </Popover.Footer>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    )
  }

  return (
    <Button
      variant={buttonVariant}
      colorPalette={buttonColorPalette}
      onClick={() => runAction()}
      loading={isLoading}
    >
      {element.label}
    </Button>
  )
}

/**
 * Web adapter over the shared `@repo/plugin-config-ui` renderer. Injects the socket-backed
 * `ActionButton` so action layout elements work in the room admin; field/layout rendering
 * (including the new `object-array` type) lives in the shared package.
 */
export default function PluginConfigForm({
  schema,
  values,
  onChange,
  allValues,
  pluginName,
  readOnlyFields,
}: PluginConfigFormProps) {
  const effectiveAllValues = allValues ?? values
  const loadRemoteOptions = React.useCallback(
    (remoteSource: string): Promise<{ value: string; label: string }[]> => {
      if (remoteSource !== "bridgeLocalPlaylists") {
        return Promise.resolve([])
      }
      return new Promise((resolve) => {
        const subscriptionId = `list-bridge-playlists-${Date.now()}`
        const timeout = window.setTimeout(() => {
          unsubscribeById(subscriptionId)
          resolve([])
        }, 8000)
        subscribeById(subscriptionId, {
          send: (event: { type: string; data?: unknown }) => {
            if (event.type !== "BRIDGE_LOCAL_PLAYLISTS") return
            window.clearTimeout(timeout)
            unsubscribeById(subscriptionId)
            const data = event.data as
              | { playlists?: Array<{ id: string; name: string; songCount?: number }> }
              | undefined
            const playlists = data?.playlists ?? []
            resolve(
              playlists.map((p) => ({
                value: p.id,
                label:
                  typeof p.songCount === "number"
                    ? `${p.name} (${p.songCount})`
                    : p.name,
              })),
            )
          },
        })
        emitToSocket("LIST_BRIDGE_LOCAL_PLAYLISTS", {})
      })
    },
    [],
  )

  return (
    <SharedPluginConfigForm
      schema={schema}
      values={values}
      onChange={onChange}
      allValues={effectiveAllValues}
      readOnlyFields={readOnlyFields}
      loadRemoteOptions={loadRemoteOptions}
      renderAction={(element) => {
        if (!pluginName) {
          console.warn("PluginConfigForm: pluginName is required to render action buttons")
          return null
        }
        return (
          <ActionButton
            element={element as PluginActionElement}
            pluginName={pluginName}
            allValues={effectiveAllValues}
            onConfigPatch={(patch) => {
              for (const [field, value] of Object.entries(patch)) {
                onChange(field, value)
              }
            }}
          />
        )
      }}
    />
  )
}

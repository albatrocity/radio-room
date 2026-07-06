import React, { useState } from "react"
import { Button, CloseButton, Field, Input, NativeSelect, Popover, Stack, Text } from "@chakra-ui/react"
import { PluginConfigForm as SharedPluginConfigForm } from "@repo/plugin-config-ui"
import type { PluginConfigFormProps as SharedProps } from "@repo/plugin-config-ui"
import type { PluginActionElement, PluginActionFormField } from "@repo/types/Plugin"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { useUsers } from "../../../hooks/useActors"
import type { User } from "../../../types/User"
import { toaster } from "../../ui/toaster"

interface PluginConfigFormProps {
  schema: SharedProps["schema"]
  values: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
  allValues?: Record<string, unknown>
  pluginName?: string
}

function emptyPluginActionFormState(fields: PluginActionFormField[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) out[f.name] = ""
  return out
}

function collectSelectOptions(field: PluginActionFormField, users: User[]) {
  const staticOpts = field.options ?? []
  const userOpts =
    field.type === "user-select"
      ? users.map((u) => ({ value: u.userId, label: u.username ?? u.userId }))
      : []
  return [...staticOpts, ...userOpts]
}

/**
 * App-specific action button. Runs plugin actions over the socket and reports via toaster —
 * the coupling that keeps this in `apps/web`. Injected into the shared renderer as `renderAction`.
 */
function ActionButton({
  element,
  pluginName,
}: {
  element: PluginActionElement
  pluginName: string
}) {
  const users = useUsers()
  const formFields = element.formFields
  const hasForm = !!formFields?.length

  const [isLoading, setIsLoading] = useState(false)
  const [formPopoverOpen, setFormPopoverOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const subscriptionIdRef = React.useRef<string | null>(null)

  const runAction = React.useCallback(
    (params?: Record<string, unknown>) => {
      setIsLoading(true)
      const subscriptionId = `plugin-action-${element.action}-${Date.now()}`
      subscriptionIdRef.current = subscriptionId

      subscribeById(subscriptionId, {
        send: (event: { type: string; data?: { success: boolean; message?: string } }) => {
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

  const submitForm = () => {
    const fields = formFields ?? []
    const params: Record<string, unknown> = {}
    for (const f of fields) {
      const raw = formValues[f.name] ?? ""
      const v = typeof raw === "string" ? raw.trim() : String(raw)
      if (f.required && !v) {
        toaster.create({
          title: "Missing information",
          description: `Please fill in "${f.label}".`,
          type: "error",
        })
        return
      }
      params[f.name] = v
    }
    runAction(params)
  }

  const buttonVariant = element.variant === "destructive" ? "outline" : element.variant || "solid"
  const buttonColorPalette = element.variant === "destructive" ? "red" : undefined

  if (hasForm && formFields) {
    return (
      <Popover.Root
        open={formPopoverOpen}
        onOpenChange={(e) => {
          setFormPopoverOpen(e.open)
          if (e.open && formFields?.length) setFormValues(emptyPluginActionFormState(formFields))
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
                {formFields.map((field) => (
                  <Field.Root key={field.name}>
                    <Field.Label fontSize="sm">{field.label}</Field.Label>
                    {field.type === "string" ? (
                      <Input
                        size="sm"
                        value={formValues[field.name] ?? ""}
                        onChange={(e) =>
                          setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                      />
                    ) : (
                      <NativeSelect.Root size="sm">
                        <NativeSelect.Field
                          value={formValues[field.name] ?? ""}
                          onChange={(e) =>
                            setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                          }
                        >
                          <option value="">Select…</option>
                          {collectSelectOptions(field, users).map((o) => (
                            <option key={`${field.name}-${o.value}`} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    )}
                  </Field.Root>
                ))}
              </Stack>
            </Popover.Body>
            <Popover.Footer justifyContent="flex-end" display="flex">
              <Button
                colorPalette={element.variant === "destructive" ? "red" : undefined}
                onClick={submitForm}
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
      <Popover.Root>
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
}: PluginConfigFormProps) {
  return (
    <SharedPluginConfigForm
      schema={schema}
      values={values}
      onChange={onChange}
      allValues={allValues}
      renderAction={(element) => {
        if (!pluginName) {
          console.warn("PluginConfigForm: pluginName is required to render action buttons")
          return null
        }
        return <ActionButton element={element as PluginActionElement} pluginName={pluginName} />
      }}
    />
  )
}

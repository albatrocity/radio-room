import { useState } from "react"
import { Button, Popover, Stack } from "@chakra-ui/react"
import type { PluginActionFormField } from "@repo/types/Plugin"
import {
  collectPluginFormValues,
  emptyPluginFormState,
  PluginFormFields,
} from "../../PluginFormFields"
import { toaster } from "../../ui/toaster"

/**
 * Collects declarative `ItemDefinition.useForm` fields before `USE_INVENTORY_ITEM` (ADR 0187).
 */
export function ItemUseFormPopover({
  fields,
  children,
  onConfirm,
  confirmLabel = "Use",
}: {
  fields: PluginActionFormField[]
  children: React.ReactNode
  onConfirm: (formValues: Record<string, string | number>) => void
  /** Primary button label (default "Use"). */
  confirmLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, string>>(() =>
    emptyPluginFormState(fields),
  )

  const reset = () => setFormValues(emptyPluginFormState(fields))

  const handleOpenChange = (e: { open: boolean }) => {
    setOpen(e.open)
    if (e.open) reset()
    else reset()
  }

  const submit = () => {
    const collected = collectPluginFormValues(fields, formValues)
    if (!collected.ok) {
      toaster.create({
        title: collected.error.title,
        description: collected.error.description,
        type: "error",
      })
      return
    }
    setOpen(false)
    reset()
    onConfirm(collected.values)
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
            <PluginFormFields
              fields={fields}
              values={formValues}
              onChange={(name, value) => setFormValues((prev) => ({ ...prev, [name]: value }))}
            />
            <Button size="xs" colorPalette="action" onClick={submit}>
              {confirmLabel}
            </Button>
          </Stack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

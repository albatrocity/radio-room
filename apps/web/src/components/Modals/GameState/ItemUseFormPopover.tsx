import { useCallback, useState } from "react"
import { Button, Popover, Stack } from "@chakra-ui/react"
import type { PluginActionFormField } from "@repo/types/Plugin"
import {
  collectPluginFormValues,
  emptyPluginFormState,
  PluginFormFields,
} from "../../PluginFormFields"
import { toaster } from "../../ui/toaster"

/**
 * Collects declarative `ItemDefinition.useForm` fields before `USE_INVENTORY_ITEM` (ADR 0187 / 0193).
 */
export function ItemUseFormPopover({
  fields,
  children,
  onConfirm,
  confirmLabel = "Use",
  coinBalance,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  fields: PluginActionFormField[]
  children: React.ReactNode
  onConfirm: (formValues: Record<string, string | number>) => void
  /** Primary button label (default "Use"). */
  confirmLabel?: string
  /** Viewer coin balance for `maxFrom: "coinBalance"`. */
  coinBalance?: number
  /** Controlled open (e.g. after a `requiresTarget` picker — ADR 0193). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : uncontrolledOpen
  const [formValues, setFormValues] = useState<Record<string, string>>(() =>
    emptyPluginFormState(fields),
  )
  const [submitBlocked, setSubmitBlocked] = useState(false)
  const handleSubmitBlockedChange = useCallback((blocked: boolean) => {
    setSubmitBlocked(blocked)
  }, [])

  const reset = () => {
    setFormValues(emptyPluginFormState(fields))
    setSubmitBlocked(false)
  }

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next)
    onOpenChangeProp?.(next)
  }

  const handleOpenChange = (e: { open: boolean }) => {
    setOpen(e.open)
    reset()
  }

  const submit = () => {
    if (submitBlocked) return
    const collected = collectPluginFormValues(fields, formValues, { coinBalance })
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
              coinBalance={coinBalance}
              onSubmitBlockedChange={handleSubmitBlockedChange}
              onChange={(name, value) => setFormValues((prev) => ({ ...prev, [name]: value }))}
            />
            <Button
              size="xs"
              colorPalette="action"
              onClick={submit}
              disabled={submitBlocked}
            >
              {confirmLabel}
            </Button>
          </Stack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

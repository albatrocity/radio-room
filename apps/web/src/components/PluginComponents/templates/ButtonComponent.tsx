import React, { useEffect, useRef, useState } from "react"
import { Button, Popover, Text } from "@chakra-ui/react"
import { getIcon } from "../icons"
import { SvgIcon } from "../../ui/svg-icon"
import { usePluginComponentContext } from "../context"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { toaster } from "../../ui/toaster"
import type { ButtonComponentProps } from "../../../types/PluginComponent"

interface ButtonTemplateComponentProps extends ButtonComponentProps {
  /**
   * The plugin name that owns this button. Injected by the renderer; required
   * when `action` is set so we can dispatch `EXECUTE_PLUGIN_ACTION` to the
   * correct plugin.
   */
  pluginName?: string
}

/**
 * Button component - opens a modal or dispatches a plugin action.
 *
 * `opensModal` and `action` are mutually exclusive in practice; if both are
 * provided we prefer `action` (since dispatching state changes is more
 * deliberate than opening a modal).
 */
export function ButtonTemplateComponent({
  label,
  icon,
  opensModal,
  action,
  confirmMessage,
  confirmText,
  variant = "ghost",
  size = "sm",
  disabled,
  pluginName,
}: ButtonTemplateComponentProps) {
  const { openModal } = usePluginComponentContext()
  const [isLoading, setIsLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const subscriptionIdRef = useRef<string | null>(null)
  const IconComponent = icon ? getIcon(icon) : undefined

  useEffect(() => {
    return () => {
      const id = subscriptionIdRef.current
      if (id) unsubscribeById(id)
    }
  }, [])

  const dispatchAction = () => {
    if (!action) return
    if (!pluginName) {
      console.warn("[PluginButton] action set but pluginName missing; skipping dispatch", action)
      return
    }

    setIsLoading(true)

    const subscriptionId = `plugin-action-${pluginName}-${action}-${Date.now()}`
    subscriptionIdRef.current = subscriptionId

    subscribeById(subscriptionId, {
      send: (event: { type: string; data?: { success: boolean; message?: string } }) => {
        if (event.type !== "PLUGIN_ACTION_RESULT" || !event.data) return
        setIsLoading(false)
        unsubscribeById(subscriptionId)
        if (subscriptionIdRef.current === subscriptionId) {
          subscriptionIdRef.current = null
        }
        toaster.create({
          title: event.data.success ? "Success" : "Error",
          description:
            event.data.message || (event.data.success ? "Action completed" : "Action failed"),
          type: event.data.success ? "success" : "error",
        })
      },
    })

    emitToSocket("EXECUTE_PLUGIN_ACTION", { pluginName, action })

    setTimeout(() => {
      if (subscriptionIdRef.current === subscriptionId) {
        setIsLoading(false)
        unsubscribeById(subscriptionId)
        subscriptionIdRef.current = null
        toaster.create({
          title: "Timeout",
          description: "Action timed out",
          type: "error",
        })
      }
    }, 10000)
  }

  const handleClick = () => {
    if (action) {
      if (confirmMessage) {
        setConfirmOpen(true)
        return
      }
      dispatchAction()
      return
    }
    if (opensModal) {
      openModal(opensModal)
    }
  }

  const buttonNode = (
    <Button
      size={size}
      variant={variant as never}
      loading={isLoading}
      disabled={disabled}
      onClick={handleClick}
    >
      {IconComponent ? <SvgIcon icon={IconComponent} mr={1} /> : null}
      {label}
    </Button>
  )

  if (action && confirmMessage) {
    return (
      <Popover.Root open={confirmOpen} onOpenChange={(e) => setConfirmOpen(e.open)}>
        <Popover.Trigger asChild>{buttonNode}</Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content>
            <Popover.Arrow />
            <Popover.Body>
              <Text>{confirmMessage}</Text>
            </Popover.Body>
            <Popover.Footer justifyContent="flex-end" display="flex">
              <Button variant="plain" size="sm" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                colorPalette="primary"
                onClick={() => {
                  setConfirmOpen(false)
                  dispatchAction()
                }}
                loading={isLoading}
              >
                {confirmText || "Confirm"}
              </Button>
            </Popover.Footer>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    )
  }

  return buttonNode
}

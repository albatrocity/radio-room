import React, { ReactNode } from "react"

import {
  DialogRoot,
  DialogBackdrop,
  DialogPositioner,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogCloseTrigger,
  CloseButton,
  Portal,
  type DialogContentProps,
  type DialogBodyProps,
} from "@chakra-ui/react"

interface Props {
  children: JSX.Element
  onClose?: () => void
  heading?: string | ReactNode
  canClose?: boolean
  open?: boolean
  footer?: JSX.Element | null
  showFooter?: boolean
  // Legacy prop support
  isOpen?: boolean
  /**
   * When false, dialog content stays mounted while closed (skips Chakra’s
   * default lazyMount + unmountOnExit). Use for heavy trees that must reopen fast
   * (e.g. Add to Queue Search/Browse).
   */
  lazyMount?: boolean
  unmountOnExit?: boolean
  /** Dialog vertical placement. Default `center`. */
  placement?: "center" | "top" | "bottom"
  /** Forwarded to `DialogContent` (e.g. viewport-capped height). */
  contentProps?: DialogContentProps
  /** Forwarded to `DialogBody`. */
  bodyProps?: DialogBodyProps
}

const Modal = ({
  children,
  onClose = () => void 0,
  heading,
  canClose = true,
  open,
  isOpen,
  footer = null,
  showFooter = true,
  lazyMount,
  unmountOnExit,
  placement = "center",
  contentProps,
  bodyProps,
}: Props) => {
  // Support both legacy isOpen and new open prop
  const isDialogOpen = open ?? isOpen ?? false

  return (
    <DialogRoot
      open={isDialogOpen}
      onOpenChange={(e) => !e.open && onClose()}
      placement={placement}
      lazyMount={lazyMount}
      unmountOnExit={unmountOnExit}
    >
      <Portal>
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent mx={2} bg="appBg" layerStyle="themeTransition" {...contentProps}>
            {heading && <DialogHeader flexShrink={0}>{heading}</DialogHeader>}

            {canClose && (
              <DialogCloseTrigger asChild position="absolute" top="2" right="2" zIndex={1}>
                <CloseButton size="sm" />
              </DialogCloseTrigger>
            )}
            <DialogBody {...bodyProps}>{children}</DialogBody>
            {showFooter && <DialogFooter flexShrink={0}>{footer}</DialogFooter>}
          </DialogContent>
        </DialogPositioner>
      </Portal>
    </DialogRoot>
  )
}

export default Modal

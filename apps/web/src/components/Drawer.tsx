import React, { ReactNode } from "react"
import {
  DrawerRoot,
  DrawerBackdrop,
  DrawerPositioner,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerCloseTrigger,
  CloseButton,
} from "@chakra-ui/react"

interface Props {
  heading?: string
  children: ReactNode
  footer?: ReactNode
  open?: boolean
  onOpenChange?: (details: { open: boolean }) => void
  placement?: "start" | "end" | "top" | "bottom"
  // Legacy prop support
  isOpen?: boolean
  onClose?: () => void
}

const Drawer = ({
  heading,
  children,
  footer,
  open,
  isOpen,
  onOpenChange,
  onClose,
  placement = "end",
}: Props) => {
  // Support both legacy isOpen and new open prop
  const isDrawerOpen = open ?? isOpen ?? false

  const handleOpenChange = (details: { open: boolean }) => {
    if (onOpenChange) {
      onOpenChange(details)
    } else if (onClose && !details.open) {
      onClose()
    }
  }

  return (
    <DrawerRoot
      open={isDrawerOpen}
      onOpenChange={handleOpenChange}
      placement={placement}
    >
      <DrawerBackdrop />
      <DrawerPositioner>
        <DrawerContent>
          {heading && <DrawerHeader>{heading}</DrawerHeader>}
          <DrawerCloseTrigger asChild position="absolute" top="2" right="2">
            <CloseButton size="sm" />
          </DrawerCloseTrigger>
          <DrawerBody>{children}</DrawerBody>
          {footer && <DrawerFooter borderTopWidth="1px">{footer}</DrawerFooter>}
        </DrawerContent>
      </DrawerPositioner>
    </DrawerRoot>
  )
}

export default Drawer

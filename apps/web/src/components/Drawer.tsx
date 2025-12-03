import React, { ReactNode } from "react"
import { Drawer as ChakraDrawer, CloseButton, DrawerRootProps } from "@chakra-ui/react"

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
  size?: DrawerRootProps["size"]
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
  size = "md",
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
    <ChakraDrawer.Root
      size={size}
      open={isDrawerOpen}
      onOpenChange={handleOpenChange}
      placement={placement}
    >
      <ChakraDrawer.Backdrop />
      <ChakraDrawer.Positioner>
        <ChakraDrawer.Content>
          {heading && (
            <ChakraDrawer.Header>
              <ChakraDrawer.Title>{heading}</ChakraDrawer.Title>
            </ChakraDrawer.Header>
          )}
          <ChakraDrawer.CloseTrigger asChild position="absolute" top="2" right="2">
            <CloseButton size="sm" />
          </ChakraDrawer.CloseTrigger>
          <ChakraDrawer.Body>{children}</ChakraDrawer.Body>
          {footer && <ChakraDrawer.Footer borderTopWidth="1px">{footer}</ChakraDrawer.Footer>}
        </ChakraDrawer.Content>
      </ChakraDrawer.Positioner>
    </ChakraDrawer.Root>
  )
}

export default Drawer

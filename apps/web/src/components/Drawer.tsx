import React, { ReactNode } from "react"
import { ButtonGroup, Drawer as ChakraDrawer, CloseButton, DrawerRootProps } from "@chakra-ui/react"

interface Props {
  heading?: string | ReactNode
  headingActions?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Skip Chakra footer padding so children can go edge-to-edge. */
  footerFlush?: boolean
  open?: boolean
  onOpenChange?: (details: { open: boolean }) => void
  placement?: "start" | "end" | "top" | "bottom"
  // Legacy prop support
  isOpen?: boolean
  onClose?: () => void
  size?: DrawerRootProps["size"]
  /**
   * Body is a definite-height flex column (`overflow: hidden`). Children that
   * should occupy leftover space opt in with `flex="1"` / `minH={0}`.
   */
  fill?: boolean
}

const Drawer = ({
  heading,
  headingActions,
  children,
  footer,
  footerFlush = false,
  open,
  isOpen,
  onOpenChange,
  onClose,
  placement = "end",
  size = "md",
  fill = false,
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
        <ChakraDrawer.Content
          {...(fill
            ? { display: "flex", flexDirection: "column", overflow: "hidden", h: "100%" }
            : {})}
        >
          <ChakraDrawer.Header
            css={{ paddingBottom: 0 }}
            minH="44px"
            alignItems="center"
            flexShrink={0}
          >
            <ChakraDrawer.Title>{heading}</ChakraDrawer.Title>
            <ButtonGroup>{headingActions}</ButtonGroup>
            <ChakraDrawer.CloseTrigger asChild>
              <CloseButton colorPalette="secondary" variant="plain" />
            </ChakraDrawer.CloseTrigger>
          </ChakraDrawer.Header>
          <ChakraDrawer.Body
            {...(fill
              ? {
                  flex: "1",
                  minH: 0,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }
              : {})}
          >
            {children}
          </ChakraDrawer.Body>
          {footer && (
            <ChakraDrawer.Footer
              borderTopWidth="1px"
              p={footerFlush ? 0 : undefined}
              flexDirection={footerFlush ? "column" : undefined}
              alignItems={footerFlush ? "stretch" : undefined}
              w="full"
              flexShrink={0}
            >
              {footer}
            </ChakraDrawer.Footer>
          )}
        </ChakraDrawer.Content>
      </ChakraDrawer.Positioner>
    </ChakraDrawer.Root>
  )
}

export default Drawer

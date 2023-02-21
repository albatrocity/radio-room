import React, { ReactNode } from "react"
import {
  Drawer as ChakraDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerProps,
  DrawerFooter,
} from "@chakra-ui/react"

interface Props extends DrawerProps {
  heading?: string
  children: ReactNode
  footer?: ReactNode
}

const Drawer = ({ heading, children, footer, ...rest }: Props) => {
  return (
    <ChakraDrawer {...rest}>
      <DrawerOverlay />
      <DrawerContent>
        {heading && <DrawerHeader>{heading}</DrawerHeader>}
        <DrawerCloseButton />
        <DrawerBody>{children}</DrawerBody>
        {footer && <DrawerFooter borderTopWidth="1px">{footer}</DrawerFooter>}
      </DrawerContent>
    </ChakraDrawer>
  )
}

export default Drawer

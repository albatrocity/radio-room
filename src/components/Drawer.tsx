import React from "react"
import {
  Drawer as ChakraDrawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerProps,
} from "@chakra-ui/react"

interface Props extends DrawerProps {
  heading?: string
}

const Drawer = ({ heading, children, ...rest }: Props) => {
  return (
    <ChakraDrawer {...rest}>
      <DrawerOverlay />
      <DrawerContent>
        {heading && <DrawerHeader>{heading}</DrawerHeader>}
        <DrawerCloseButton />
        <DrawerBody>{children}</DrawerBody>
      </DrawerContent>
    </ChakraDrawer>
  )
}

export default Drawer

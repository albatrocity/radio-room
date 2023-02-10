import React, { useContext, useEffect } from "react"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"

import { GlobalStateContext } from "../contexts/global"
import Room from "./Room"
init({ data })

const RadioApp = () => {
  const isVisible = usePageVisibility()
  const globalServices = useContext(GlobalStateContext)

  useEffect(() => {
    globalServices.authService.send("SETUP")
    return () => {
      globalServices.authService.send("USER_DISCONNECTED")
    }
  }, [globalServices.authService])

  useEffect(() => {
    if (isVisible) {
      globalServices.authService.send("SETUP")
    }
  }, [isVisible])

  return (
    <Flex grow={1} shrink={1} w="100%" h="100%">
      <Room />
    </Flex>
  )
}

export default RadioApp

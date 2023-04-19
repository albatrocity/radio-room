import React, { useEffect } from "react"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"

import { useAuthStore } from "../state/authStore"
import Room from "./Room"
init({ data })

const RadioApp = () => {
  const isVisible = usePageVisibility()

  const { send } = useAuthStore()

  useEffect(() => {
    send("SETUP")
    return () => {
      send("USER_DISCONNECTED")
    }
  }, [send])

  useEffect(() => {
    if (isVisible) {
      send("SETUP")
    }
  }, [isVisible])

  return (
    <Flex grow={1} shrink={1} w="100%" h="100%">
      <Room />
    </Flex>
  )
}

export default RadioApp

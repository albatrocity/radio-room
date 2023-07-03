import React, { useEffect } from "react"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"

import Room from "./Room"
import AppToasts from "./AppToasts"
import { useAuthStore } from "../state/authStore"
import { fetchSettings } from "../state/globalSettingsStore"

init({ data })

const RadioApp = () => {
  const isVisible = usePageVisibility()

  const { send } = useAuthStore()

  useEffect(() => {
    fetchSettings()
    send("SETUP")
    return () => {
      send("USER_DISCONNECTED")
    }
  }, [send, fetchSettings])

  useEffect(() => {
    if (isVisible) {
      send("SETUP")
    }
  }, [isVisible])

  return (
    <Flex grow={1} shrink={1} w="100%" h="100%">
      <AppToasts />
      <Room />
    </Flex>
  )
}

export default RadioApp

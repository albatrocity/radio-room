import React, { useEffect } from "react"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex, useToast, UseToastOptions } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"
import { navigate, useLocation, WindowLocation } from "@reach/router"

import { useAuthStore } from "../state/authStore"
import Room from "./Room"
import { fetchSettings } from "../state/globalSettingsStore"
init({ data })

type LocationState = {
  toast?: UseToastOptions
}

const RadioApp = () => {
  const location = useLocation() as WindowLocation<LocationState>
  const toast = useToast()
  const isVisible = usePageVisibility()

  const { send } = useAuthStore()

  useEffect(() => {
    fetchSettings()
    send("SETUP")
    if (location.state?.toast) {
      toast({
        title: location.state.toast.title,
        description: location.state.toast.description,
        status: location.state.toast.status,
        duration: 5000,
        isClosable: true,
        position: "top",
      })
      navigate(location.pathname, {
        replace: true,
        state: { ...location.state, toast: undefined },
      })
    }

    return () => {
      send("USER_DISCONNECTED")
    }
  }, [send, fetchSettings, location.state?.toast, toast])

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

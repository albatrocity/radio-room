import React, { useEffect } from "react"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex, useToast } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"
import { useLocation } from "@reach/router"

import { useAuthStore } from "../state/authStore"
import Room from "./Room"
init({ data })

const RadioApp = () => {
  const location = useLocation()
  const toast = useToast()
  const isVisible = usePageVisibility()

  const { send } = useAuthStore()

  useEffect(() => {
    send("SETUP")

    const p = new URLSearchParams(location.search)
    if (p.get("spotifyAuth") === "true") {
      toast({
        title: "Spotify Connected",
        description: "Your Spotify account is now linked",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "top",
      })
    }

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

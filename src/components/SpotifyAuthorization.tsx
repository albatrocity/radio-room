import React from "react"
import { useEffect } from "react"
import { useLocation } from "@reach/router"
import { useSpotifyAuthStore } from "../state/spotifyAuthStore"
import { Center, Spinner, VStack, Text } from "@chakra-ui/react"
import { navigate } from "gatsby"

export default function SpotifyAuthorization() {
  const location = useLocation()

  const { send } = useSpotifyAuthStore()

  const urlParams = new URLSearchParams(location.search)
  const code = urlParams.get("code")

  useEffect(() => {
    if (code) {
      send("REQUEST_TOKEN", { data: code })
    } else {
      navigate("/", { replace: true })
    }
  }, [code])

  return (
    <Center h="100%" w="100%">
      <VStack spacing={4}>
        <Spinner size="lg" />
        <Text>Linking your account...</Text>
      </VStack>
    </Center>
  )
}

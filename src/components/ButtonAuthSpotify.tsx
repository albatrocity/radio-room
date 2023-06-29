// component for the button to authenticate with Spotify
import React from "react"
import { Link, Box, Button, Icon, Text, HStack } from "@chakra-ui/react"
import { CheckCircleIcon } from "@chakra-ui/icons"
import { FaSpotify } from "react-icons/fa"

import { useCurrentUser } from "../state/authStore"
import { useSpotifyAuthStore } from "../state/spotifyAuthStore"

export default function ButtonAuthSpotify({ userId }: { userId?: string }) {
  const currentUser = useCurrentUser()
  const { state, send } = useSpotifyAuthStore()
  const isApp = userId === "app"
  console.log(state.value)

  return (
    <Box>
      {!state.matches("authenticated") && (
        <Button
          as={isApp ? Link : undefined}
          href={
            isApp
              ? `${process.env.GATSBY_API_URL}/login?userId=${
                  userId ?? currentUser.userId
                }`
              : undefined
          }
          onClick={
            isApp
              ? undefined
              : (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  send("GENERATE_LOGIN_URL")
                }
          }
          leftIcon={<Icon as={FaSpotify} />}
          isLoading={state.matches("working")}
          isDisabled={state.matches("working")}
        >
          Link Spotify
        </Button>
      )}
      {state.matches("authenticated") && (
        <HStack spacing={2}>
          <CheckCircleIcon color="primary" />
          <Text fontSize="sm">
            Your Spotify account is linked
            {userId === "app" ? " to the application" : ""}.
          </Text>
        </HStack>
      )}
    </Box>
  )
}

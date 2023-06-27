// component for the button to authenticate with Spotify
import React from "react"
import { Link, Box, Button, Icon, Text, HStack } from "@chakra-ui/react"
import { CheckCircleIcon } from "@chakra-ui/icons"
import { useMachine } from "@xstate/react"
import { FaSpotify } from "react-icons/fa"

import { spotifyAuthMachine } from "../machines/spotifyAuthMachine"
import { useCurrentUser } from "../state/authStore"

export default function ButtonAuthSpotify() {
  const currentUser = useCurrentUser()
  const [state] = useMachine(spotifyAuthMachine)
  return (
    <Box>
      {(state.matches("unauthenticated") || state.matches("loading")) && (
        <Button
          as={Link}
          href={`${process.env.GATSBY_API_URL}/login?userId=${currentUser.userId}`}
          leftIcon={<Icon as={FaSpotify} />}
          isLoading={state.matches("loading")}
          isDisabled={state.matches("loading")}
        >
          Link Spotify
        </Button>
      )}
      {state.matches("authenticated") && (
        <HStack spacing={2}>
          <CheckCircleIcon color="primary" />
          <Text fontSize="sm">Your Spotify account is linked.</Text>
        </HStack>
      )}
    </Box>
  )
}

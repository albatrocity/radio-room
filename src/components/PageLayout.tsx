import React, { useEffect } from "react"
import {
  Box,
  Button,
  Heading,
  HStack,
  Show,
  Text,
  useDisclosure,
} from "@chakra-ui/react"
import { Link } from "gatsby"

import Layout from "./layout"
import { AddIcon } from "@chakra-ui/icons"
import { useModalsStore } from "../state/modalsState"
import { FaSpotify } from "react-icons/fa"
import { useAuthStore, useCurrentUser } from "../state/authStore"
import ConfirmationDialog from "./ConfirmationDialog"

type Props = {
  children: React.ReactNode
}

export default function PageLayout({ children }: Props) {
  const { send, state } = useModalsStore()
  const { send: authSend } = useAuthStore()
  const currentUser = useCurrentUser()

  useEffect(() => {
    authSend("GET_SESSION_USER")
  }, [])

  return (
    <Layout>
      <>
        <ConfirmationDialog
          title="Disconnect Spotify?"
          body={
            <Text>
              Are you sure you want to delete all of your rooms and disconnect
              your Spotify account?
            </Text>
          }
          isOpen={state.matches("nukeUser")}
          onClose={() => send("CLOSE")}
          onConfirm={() => authSend("NUKE_USER")}
          isDangerous={true}
          confirmLabel="Disconnect Spotify"
        />
        <Box>
          <HStack
            p={4}
            bg="secondaryBg"
            w="100%"
            justifyContent="space-between"
          >
            <Show above="sm">
              <Heading>Listening Rooms</Heading>
            </Show>
            <HStack>
              {currentUser ? (
                <HStack>
                  <Button onClick={() => send("NUKE_USER")} variant="ghost">
                    Disconnect Spotify
                  </Button>
                  <Button onClick={() => authSend("LOGOUT")} variant="ghost">
                    Logout
                  </Button>
                </HStack>
              ) : (
                <Button
                  as={Link}
                  to="/login"
                  variant="outline"
                  leftIcon={<FaSpotify />}
                >
                  Login
                </Button>
              )}
              <Button
                leftIcon={<AddIcon />}
                onClick={() => send("CREATE_ROOM")}
              >
                Create a Room
              </Button>
            </HStack>
          </HStack>
          <Box as="main" p={4}>
            {children}
          </Box>
        </Box>
      </>
    </Layout>
  )
}

import React, { useEffect } from "react"
import {
  Box,
  Button,
  Grid,
  GridItem,
  Heading,
  Hide,
  HStack,
  IconButton,
  Link as ChakraLink,
  Show,
  Text,
  Wrap,
  WrapItem,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"

import Layout from "./layout"
import { AddIcon } from "@chakra-ui/icons"
import { useModalsStore } from "../state/modalsState"
import { FaSpotify } from "react-icons/fa"
import { useAuthStore, useCurrentUser } from "../state/authStore"
import ConfirmationDialog from "./ConfirmationDialog"
import LobbyOverlays from "./Lobby/LobbyOverlays"

type Props = {
  children: React.ReactNode
}

export default function PageLayout({ children }: Props) {
  const { send, state } = useModalsStore()
  const { send: authSend } = useAuthStore()
  const currentUser = useCurrentUser()
  const isHome = window.location.pathname === "/"

  useEffect(() => {
    authSend("GET_SESSION_USER")
  }, [authSend])

  return (
    <Layout fill>
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
        <Grid templateRows="auto 1fr auto" h="100%">
          <GridItem>
            <HStack p={4} bg="secondaryBg" justifyContent="space-between">
              <Show above="sm">
                <Heading as="h2" size="lg">
                  {isHome ? (
                    "Listening Room"
                  ) : (
                    <ChakraLink to="/" as={Link}>
                      Listening Room
                    </ChakraLink>
                  )}
                </Heading>
              </Show>
              <HStack justifyContent="flex-end">
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
                <Box>
                  <Show above="sm">
                    <Button
                      leftIcon={<AddIcon />}
                      onClick={() => send("CREATE_ROOM")}
                    >
                      Create a Room
                    </Button>
                  </Show>
                  <Hide above="sm">
                    <IconButton
                      icon={<AddIcon />}
                      onClick={() => send("CREATE_ROOM")}
                      aria-label="Create a Room"
                    />
                  </Hide>
                </Box>
              </HStack>
            </HStack>
          </GridItem>
          <GridItem>
            <Box as="main" p={4}>
              {children}
            </Box>
          </GridItem>
          <GridItem as="footer" textStyle="footer">
            <Wrap p={4} bg="secondaryBg" spacing={4}>
              <WrapItem>
                <ChakraLink as={Link} to="/privacy">
                  Privacy Policy
                </ChakraLink>
              </WrapItem>
              <WrapItem>
                <ChakraLink as={Link} to="/about">
                  About
                </ChakraLink>
              </WrapItem>
              {import.meta.env.VITE_CONTACT_EMAIL && (
                <WrapItem>
                  <ChakraLink
                    href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL}?subject=Listening%20Room`}
                  >
                    Contact
                  </ChakraLink>
                </WrapItem>
              )}
            </Wrap>
          </GridItem>
        </Grid>
        <LobbyOverlays />
      </>
    </Layout>
  )
}

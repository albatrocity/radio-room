import React, { useEffect } from "react"
import {
  Box,
  Button,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Link as ChakraLink,
  Text,
  Wrap,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"

import Layout from "./layout"
import { LuPlus } from "react-icons/lu"
import { FaSpotify } from "react-icons/fa"
import { useModalsSend, useIsModalOpen, useAuthSend, useCurrentUser } from "../hooks/useActors"
import ConfirmationDialog from "./ConfirmationDialog"
import LobbyOverlays from "./Lobby/LobbyOverlays"

type Props = {
  children: React.ReactNode
}

export default function PageLayout({ children }: Props) {
  const modalSend = useModalsSend()
  const isNukeUserModalOpen = useIsModalOpen("nukeUser")
  const authSend = useAuthSend()
  const currentUser = useCurrentUser()
  const isHome = window.location.pathname === "/"

  useEffect(() => {
    authSend({ type: "GET_SESSION_USER" })
  }, [authSend])

  return (
    <Layout fill>
      <>
        <ConfirmationDialog
          title="Disconnect Spotify?"
          body={
            <Text>
              Are you sure you want to delete all of your rooms and disconnect your Spotify account?
            </Text>
          }
          open={isNukeUserModalOpen}
          onClose={() => modalSend({ type: "CLOSE" })}
          onConfirm={() => authSend({ type: "NUKE_USER" })}
          isDangerous={true}
          confirmLabel="Disconnect Spotify"
        />
        <Grid templateRows="auto 1fr auto" h="100%">
          <GridItem>
            <HStack p={4} bg="secondaryBg" justifyContent="space-between">
              <Box hideBelow="sm">
                <Heading as="h2" size="lg">
                  {isHome ? (
                    "Listening Room"
                  ) : (
                    <ChakraLink asChild>
                      <Link to="/">Listening Room</Link>
                    </ChakraLink>
                  )}
                </Heading>
              </Box>
              <HStack justifyContent="flex-end">
                {currentUser ? (
                  <HStack>
                    <Button onClick={() => modalSend({ type: "NUKE_USER" })} variant="ghost">
                      Disconnect Spotify
                    </Button>
                    <Button onClick={() => authSend({ type: "LOGOUT" })} variant="ghost">
                      Logout
                    </Button>
                  </HStack>
                ) : (
                  <Button asChild variant="outline">
                    <Link to="/login">
                      <FaSpotify />
                      Login
                    </Link>
                  </Button>
                )}
                <Box>
                  <Box hideBelow="sm">
                    <Button onClick={() => modalSend({ type: "CREATE_ROOM" })}>
                      <LuPlus />
                      Create a Room
                    </Button>
                  </Box>
                  <Box hideFrom="sm">
                    <IconButton onClick={() => modalSend({ type: "CREATE_ROOM" })} aria-label="Create a Room">
                      <LuPlus />
                    </IconButton>
                  </Box>
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
            <Wrap p={4} bg="secondaryBg" gap={4}>
              <ChakraLink asChild>
                <Link to="/privacy">Privacy Policy</Link>
              </ChakraLink>
              <ChakraLink asChild>
                <Link to="/about">About</Link>
              </ChakraLink>
              {import.meta.env.VITE_CONTACT_EMAIL && (
                <ChakraLink
                  href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL}?subject=Listening%20Room`}
                >
                  Contact
                </ChakraLink>
              )}
            </Wrap>
          </GridItem>
        </Grid>
        <LobbyOverlays />
      </>
    </Layout>
  )
}

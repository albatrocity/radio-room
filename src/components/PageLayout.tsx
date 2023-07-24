import React, { useEffect } from "react"
import { Box, Button, Heading, HStack, Show } from "@chakra-ui/react"

import Layout from "./layout"
import { AddIcon } from "@chakra-ui/icons"
import { useModalsStore } from "../state/modalsState"
import { FaSpotify } from "react-icons/fa"
import { Link } from "gatsby"
import { useAuthStore, useCurrentUser } from "../state/authStore"

type Props = {
  children: React.ReactNode
}

export default function PageLayout({ children }: Props) {
  const { send } = useModalsStore()
  const { send: authSend } = useAuthStore()
  const currentUser = useCurrentUser()

  useEffect(() => {
    authSend("GET_SESSION_USER")
  }, [])

  return (
    <Layout>
      <Box>
        <HStack p={4} bg="secondaryBg" w="100%" justifyContent="space-between">
          <Show above="sm">
            <Heading>Rooms</Heading>
          </Show>
          <HStack>
            {currentUser ? (
              <Button onClick={() => authSend("LOGOUT")} variant="ghost">
                Logout
              </Button>
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
            <Button leftIcon={<AddIcon />} onClick={() => send("CREATE_ROOM")}>
              Create a Room
            </Button>
          </HStack>
        </HStack>
        <Box as="main" p={4}>
          {children}
        </Box>
      </Box>
    </Layout>
  )
}

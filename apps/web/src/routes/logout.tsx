import React, { useEffect } from "react"
import { createFileRoute } from '@tanstack/react-router'

import Layout from "../components/layout"
import { Center, Heading } from "@chakra-ui/react"
import { useAuthSend } from "../hooks/useActors"

export const Route = createFileRoute('/logout')({
  component: LogoutPage,
})

function LogoutPage() {
  const authSend = useAuthSend()
  
  useEffect(() => {
    authSend({ type: "LOGOUT" })
  }, [authSend])

  return (
    <Layout>
      <Center h="100vh">
        <Heading>Logging out</Heading>
      </Center>
    </Layout>
  )
}


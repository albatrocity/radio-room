import React, { useEffect } from "react"
import { createFileRoute } from '@tanstack/react-router'

import Layout from "../components/layout"
import { Center, Heading } from "@chakra-ui/react"
import { useAuthStore } from "../state/authStore"

export const Route = createFileRoute('/logout')({
  component: LogoutPage,
})

function LogoutPage() {
  const { send } = useAuthStore()
  
  useEffect(() => {
    send("LOGOUT")
  }, [send])

  return (
    <Layout>
      <Center h="100vh">
        <Heading>Logging out</Heading>
      </Center>
    </Layout>
  )
}


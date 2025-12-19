import React, { useEffect } from "react"
import { createFileRoute } from "@tanstack/react-router"

import Layout from "../components/layout"
import { Center, Heading } from "@chakra-ui/react"

export const Route = createFileRoute("/login")({
  component: LoginPage,
})

function LoginPage() {
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000"
    console.log("Redirecting to Spotify login, API URL:", apiUrl)
    // Use window.location.href for external redirect
    window.location.href = `${apiUrl}/auth/spotify/login?redirect=/admin`
  }, [])

  return (
    <Layout>
      <Center h="100vh">
        <Heading>Sending you to Spotify...</Heading>
      </Center>
    </Layout>
  )
}

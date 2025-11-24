import React from "react"
import { useEffect } from "react"
import { useAuthStore } from "../state/authStore"
import { Center, Spinner, VStack, Text } from "@chakra-ui/react"
import { useNavigate, useSearch } from "@tanstack/react-router"

export default function SpotifyAuthorization() {
  const navigate = useNavigate()
  const searchParams = useSearch({ strict: false })
  const { send: sendAuth } = useAuthStore()

  const userId = (searchParams as any).userId
  const challenge = (searchParams as any).challenge

  useEffect(() => {
    // Handle server-side OAuth callback
    if (userId) {
      console.log("Server-side OAuth callback detected for user:", userId)
      
      // Trigger auth machine to check session
      sendAuth("GET_SESSION_USER")
      
      // Get redirect path and navigate
      const redirectPath = sessionStorage.getItem("postSpotifyAuthRedirect") ?? "/"
      sessionStorage.removeItem("postSpotifyAuthRedirect")
      
      // Preserve userId and challenge params if present (needed for room creation)
      const redirectUrl = new URL(redirectPath, window.location.origin)
      if (userId) redirectUrl.searchParams.set("userId", userId)
      if (challenge) redirectUrl.searchParams.set("challenge", challenge)
      
      // Clean URL and navigate
      setTimeout(() => {
        navigate({
          to: redirectUrl.pathname as any,
          search: Object.fromEntries(redirectUrl.searchParams),
          replace: true,
        })
      }, 500)
    }
    // No OAuth parameters, just redirect
        else {
          const redirectPath = sessionStorage.getItem("postSpotifyAuthRedirect") ?? "/"
          sessionStorage.removeItem("postSpotifyAuthRedirect")
          navigate({ to: redirectPath as any, replace: true })
        }
  }, [userId])

  return (
    <Center h="100vh" w="100%">
      <VStack spacing={4}>
        <Spinner size="lg" />
        <Text>Linking your account...</Text>
      </VStack>
    </Center>
  )
}

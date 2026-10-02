"use client"

import { Box, Container, Stack } from "@chakra-ui/react"
import { useEffect } from "react"
import { SandboxPage } from "./components/studio/SandboxPage"
import { StudioHeader } from "./components/studio/StudioHeader"
import { TripMapEditor } from "./components/tripMap/TripMapEditor"
import { useStudioBootstrap } from "./hooks/useStudioBootstrap"
import { useStudioPage } from "./hooks/useStudioPage"
import { connectStudioBridge, connectStudioBridgeControl } from "./studio/bridgeClient"
import { startModifierTicker, stopModifierTicker } from "./studio/studioEnvironment"

/**
 * Studio shell. The sandbox, bridge sync, and modifier ticker live here so the
 * Room UI preview stays connected while another page is open.
 */
export function GameStudioApp() {
  const boot = useStudioBootstrap()
  const page = useStudioPage()

  useEffect(() => {
    startModifierTicker()
    return () => stopModifierTicker()
  }, [])

  useEffect(() => {
    if (!boot) return
    const url = import.meta.env.VITE_STUDIO_BRIDGE_URL ?? "http://127.0.0.1:3099"
    const unsubSync = connectStudioBridge(boot.room, url)
    const unsubControl = connectStudioBridgeControl(url, boot.room.roomId)
    return () => {
      unsubSync()
      unsubControl()
    }
  }, [boot])

  return (
    <Box minH="100dvh" py="6">
      <Container maxW="breakpoint-xl">
        <Stack gap="6">
          <StudioHeader page={page} />
          {page === "trip-maps" ? <TripMapEditor /> : <SandboxPage boot={boot} />}
        </Stack>
      </Container>
    </Box>
  )
}

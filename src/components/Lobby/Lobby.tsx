import React from "react"
import { Box, Button, Grid, Heading, HStack } from "@chakra-ui/react"
import { useModalsStore } from "../../state/modalsState"
import LobbyOverlays from "./LobbyOverlays"

export default function Lobby() {
  const { send } = useModalsStore()
  return (
    <Box>
      <HStack w="100%" justifyContent="space-between">
        <Heading>Rooms</Heading>
        <Button onClick={() => send("CREATE_ROOM")}>Create a Room</Button>
      </HStack>
      <Grid></Grid>
      <LobbyOverlays />
    </Box>
  )
}

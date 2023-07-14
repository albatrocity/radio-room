import React, { useEffect } from "react"
import {
  Box,
  Button,
  Card,
  CardHeader,
  CardBody,
  Grid,
  Heading,
  HStack,
  GridItem,
  Divider,
  VStack,
} from "@chakra-ui/react"
import { useModalsStore } from "../../state/modalsState"
import LobbyOverlays from "./LobbyOverlays"
import { useCurrentUser } from "../../state/authStore"
import { useMachine } from "@xstate/react"
import { createdRoomsFetchMachine } from "../../machines/createdRoomsFetchMachine"
import { Link } from "gatsby"
import ParsedEmojiMessage from "../ParsedEmojiMessage"
import { AddIcon } from "@chakra-ui/icons"

export default function Lobby() {
  const { send } = useModalsStore()
  const user = useCurrentUser()

  const [state, fetchSend] = useMachine(createdRoomsFetchMachine, {
    context: {
      userId: user.userId,
    },
  })

  useEffect(() => {
    fetchSend("FETCH")
  }, [user.userId])

  return (
    <Box>
      <HStack w="100%" justifyContent="space-between">
        <Heading>Rooms</Heading>
        <Button leftIcon={<AddIcon />} onClick={() => send("CREATE_ROOM")}>
          Create a Room
        </Button>
      </HStack>
      <Grid
        my={4}
        templateColumns={[
          "repeat(1, 1fr)",
          "repeat(2, 1fr)",
          "repeat(3, 1fr)",
          "repeat(4, 1fr)",
        ]}
        gap={6}
      >
        {state.context.rooms.map((room) => (
          <GridItem key={room.id}>
            <Card>
              <CardHeader>
                <Heading size="md">{room.title}</Heading>
              </CardHeader>
              <CardBody>
                <VStack spacing={2} align="stretch">
                  <ParsedEmojiMessage content={room.extraInfo} />
                  <Button as={Link} to={`/rooms/${room.id}`}>
                    Join
                  </Button>
                </VStack>
              </CardBody>
            </Card>
          </GridItem>
        ))}
      </Grid>
      <LobbyOverlays />
    </Box>
  )
}

import { Link as GatsbyLink } from "gatsby"
import {
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
  Text,
  Link,
  VStack,
  GridItem,
  List,
  ListItem,
  CloseButton,
} from "@chakra-ui/react"
import React from "react"

import { createToggleableCollectionMachine } from "../machines/toggleableCollectionMachine"
import { useMachine } from "@xstate/react"

type Props = {}

export default function AppIntro({}: Props) {
  const [state, send] = useMachine(
    createToggleableCollectionMachine({
      name: "appIntroDismissals",
      persistent: true,
      collection: [{ id: "roomTypes" }, { id: "welcome" }],
    }),
  )

  return (
    <>
      {!state.context.collection.find((item) => item.id === "welcome") && (
        <GridItem colSpan={[1, 3, 3, 2]}>
          <Card>
            <CardHeader>
              <HStack justifyContent="space-between" spacing={2}>
                <Heading size="lg">Welcome!</Heading>
                <CloseButton
                  onClick={() =>
                    send("TOGGLE_ITEM", { data: { id: "welcome" } })
                  }
                />
              </HStack>
            </CardHeader>
            <CardBody>
              <VStack spacing={2} align="stretch">
                <Text as="p">
                  This app lets you create virtual rooms for your friends to
                  join so that you can queue up music and listen together in the
                  same physical space. Creating a room links your Spotify
                  Premium account to it, displaying what's currently playing.
                  The data collected and stored is pretty ephemeral and won't be
                  used for anything nepharious. Check out the{" "}
                  <Link color="primary" as={GatsbyLink} to="/privacy-policy">
                    Privacy Policy
                  </Link>{" "}
                  for more details.
                </Text>
              </VStack>
            </CardBody>
          </Card>
        </GridItem>
      )}
      {!state.context.collection.find((item) => item.id === "roomTypes") && (
        <GridItem colSpan={[1, 3, 3, 2]}>
          <Card>
            <CardHeader>
              <HStack justifyContent="space-between" spacing={2}>
                <Heading size="lg">Room Types</Heading>
                <CloseButton
                  onClick={() =>
                    send("TOGGLE_ITEM", { data: { id: "roomTypes" } })
                  }
                />
              </HStack>
            </CardHeader>
            <CardBody>
              <VStack spacing={2} align="stretch">
                <Text as="p">You can create two types of rooms:</Text>
                <List spacing={2}>
                  <ListItem>
                    <Text as="strong">Jukebox</Text>: displays what you're
                    currently playing and let's guests add songs to your queue
                    by searching through your Spotify library. Great for house
                    parties and road trips.
                  </ListItem>
                  <ListItem>
                    <Text as="strong">Radio</Text>: pulls now playing data from
                    an internet radio station and searches for matching tracks
                    on Spotify. Great for bolstering your library or having a
                    discussion around a broadcast. Plug in the station URL and
                    watch the tracks roll in.
                  </ListItem>
                </List>
              </VStack>
            </CardBody>
          </Card>
        </GridItem>
      )}
    </>
  )
}

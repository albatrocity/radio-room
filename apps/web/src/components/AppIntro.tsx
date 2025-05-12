import {
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
  Text,
  VStack,
  GridItem,
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
                  Send the URL to your friends and they can add songs to your
                  Spotify queue.
                </Text>
              </VStack>
            </CardBody>
          </Card>
        </GridItem>
      )}
    </>
  )
}

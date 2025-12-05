import {
  Card,
  Heading,
  HStack,
  Text,
  VStack,
  GridItem,
  CloseButton,
} from "@chakra-ui/react"
import React, { useMemo } from "react"

import { createToggleableCollectionMachine } from "../machines/toggleableCollectionMachine"
import { useMachine } from "@xstate/react"

type Props = {}

export default function AppIntro({}: Props) {
  const machine = useMemo(
    () =>
      createToggleableCollectionMachine({
        name: "appIntroDismissals",
        persistent: true,
        collection: [{ id: "roomTypes" }, { id: "welcome" }],
      }),
    [],
  )

  const [state, send] = useMachine(machine)

  return (
    <>
      {!state.context.collection.find((item) => item.id === "welcome") && (
        <GridItem key="welcome-card" colSpan={[1, 3, 3, 2]}>
          <Card.Root>
            <Card.Header>
              <HStack justifyContent="space-between" gap={2}>
                <Heading size="lg">Welcome!</Heading>
                <CloseButton
                  onClick={() =>
                    send({ type: "TOGGLE_ITEM", data: { id: "welcome" } })
                  }
                />
              </HStack>
            </Card.Header>
            <Card.Body>
              <VStack gap={2} align="stretch">
                <Text as="p">
                  This app lets you create virtual rooms for your friends to
                  join so that you can queue up music and listen together in the
                  same physical space. Creating a room links your Spotify
                  Premium account to it, displaying what's currently playing.
                  Send the URL to your friends and they can add songs to your
                  Spotify queue.
                </Text>
              </VStack>
            </Card.Body>
          </Card.Root>
        </GridItem>
      )}
    </>
  )
}

import React from "react"
import { Box, Text, Link, Icon } from "@chakra-ui/react"
import { useRoomCreator, useListeners } from "../hooks/useActors"
import { BiCrown } from "react-icons/bi"

type Props = {}

function AboutContent({}: Props) {
  const creator = useRoomCreator()
  const users = useListeners()
  const creatorName =
    users.find((u) => u.userId === creator)?.username ?? creator
  return (
    <Box p="md" textStyle="body">
      <Text as="p">
        Thanks for being here! You are participating in a Listening Room created
        by <Icon as={BiCrown} boxSize={3} />{" "}
        <Text as="strong">{creatorName}</Text>, and you're seeing what's
        currently playing on their{" "}
        <Link href="https://spotify.com">Spotify</Link> account. Learn more
        about this project by visiting the{" "}
        <Link href="/about" isExternal>
          About page
        </Link>
        .
      </Text>
      <Text>
        If you're having fun with this, you can{" "}
        <Link href="/" isExternal>
          create a room of your own
        </Link>{" "}
        and link your Spotify account to it.
      </Text>
      <Text as="p">
        As little data as possible is stored on our servers: learn more by
        reading the{" "}
        <Link href="/privacy" isExternal>
          Privacy Policy
        </Link>
        .
      </Text>
    </Box>
  )
}

export default AboutContent

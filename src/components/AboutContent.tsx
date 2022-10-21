import React from "react"
import { Box, Heading, Text, Link } from "@chakra-ui/react"

type Props = {}

function AboutContent({}: Props) {
  return (
    <Box p="md" textStyle="spacedText">
      <Text as="p">
        Thanks for being here! You are participating in a somewhat communal
        listening of an internet radio broadcast. Please note that there's a
        10-15 second broadcast delay. This is made for fun only.
      </Text>
      <Heading as="h3" size="lg">
        Psuedo-legal
      </Heading>
      <Text as="p">
        No personally identifiably information (other than the name you submit)
        is collected by this service. All chat, playlist, and username data is
        stored in server memory and will be obliterated when the server restarts
        or crashes. Take solace in this sandcastle by the waves.
      </Text>
      <Heading as="h3" size="lg">
        Help
      </Heading>
      <Text as="p">
        If you're experiencing issues, try refreshing the page. If all hope is
        lost, contact <Text as="b">@Ross</Text> in the chat or send him{" "}
        <Link href="mailto:albatrocity@gmail.com">a nice email</Link>.
      </Text>
      <Heading as="h3" size="lg">
        Technical
      </Heading>
      <Text as="p" mb="lg">
        This is a{" "}
        <Link target="_blank" href="http://reactjs.org">
          React
        </Link>
        /
        <Link target="_blank" href="http://gatsbyjs.com">
          Gatsby
        </Link>{" "}
        web application (using the{" "}
        <Link target="_blank" href="http://v2.grommet.io">
          Grommet
        </Link>{" "}
        component library) that communicates to a NodeJS web process to
        facilitate{" "}
        <Link target="_blank" href="http://socket.io">
          Socket.io
        </Link>{" "}
        connections and poll a Shoutcast server that's actually streaming the
        audio. Cover art and release information is fetched from the{" "}
        <Link target="_blank" href="https://musicbrainz.org">
          MusicBrainz
        </Link>{" "}
        API. Typically, broadcasting is done using some excellent software from{" "}
        <Link target="_blank" href="http://rogueamoeba.com">
          Rogue Amoeba
        </Link>
        .
      </Text>
    </Box>
  )
}

export default AboutContent

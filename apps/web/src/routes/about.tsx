import { Box, Container, Heading, Link, Text } from "@chakra-ui/react"
import React from "react"
import { createFileRoute } from '@tanstack/react-router'
import PageLayout from "../components/PageLayout"

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

function AboutPage() {
  return (
    <PageLayout>
      <Container margin={0}>
        <Box textStyle="body">
          <Heading as={"h1"} size="2xl" mb={2}>
            About
          </Heading>
          <Text>
            Listening Room is a project created by me,{" "}
            <Link href="https://github.com/albatrocity" isExternal>
              Ross Brown
            </Link>
            , to facilitate more fun house parties and hang sessions with
            friends. Track, Artist, and Album information is provided by{" "}
            <Link href="https://spotify.com" isExternal>
              Spotify
            </Link>
            . It's not indexed by search engines, but feel free to share it with
            your friends. It's a labor of love and learning.
          </Text>
          {import.meta.env.VITE_CONTACT_EMAIL && (
            <Text>
              If you'd like to get in touch you can{" "}
              <Link
                href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL}?subject=Listening%20Room`}
              >
                send me an email
              </Link>
              .
            </Text>
          )}
          <Text>
            You can view the source code for both the{" "}
            <Link href="https://github.com/albatrocity/radio-room" isExternal>
              browser application
            </Link>{" "}
            and the{" "}
            <Link
              href="https://github.com/albatrocity/radio-room-server"
              isExternal
            >
              server
            </Link>{" "}
            on{" "}
            <Link href="https://github.com/albatrocity" isExternal>
              GitHub
            </Link>
            . Both codebases are written in TypeScript.
          </Text>
        </Box>
      </Container>
    </PageLayout>
  )
}


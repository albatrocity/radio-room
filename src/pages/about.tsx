import { Box, Container, Heading, Link, Text } from "@chakra-ui/react"
import { graphql, HeadProps } from "gatsby"
import React from "react"
import PageLayout from "../components/PageLayout"
import { SiteMetadata } from "../types/SiteMetadata"

type Props = {}

export default function Privacy({}: Props) {
  return (
    <PageLayout>
      <Container margin={0}>
        <Box textStyle="body">
          <Heading as={"h1"} size="2xl" mb={2}>
            About
          </Heading>
          <Text>
            Listening Room is a hobby project created by me,{" "}
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
          {process.env.GATSBY_CONTACT_EMAIL && (
            <Text>
              If you'd like to get in touch you can{" "}
              <Link
                href={`mailto:${process.env.GATSBY_CONTACT_EMAIL}?subject=Listening%20Room`}
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

export function Head({ data }: HeadProps<SiteMetadata>) {
  return (
    <>
      <title>About {data.site.siteMetadata.title}</title>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <meta name="description" content={data.site.siteMetadata.description} />
      <meta
        name="og:description"
        content={data.site.siteMetadata.description}
      />
      <meta name="og:title" content={data.site.siteMetadata.title} />
      <meta name="og:type" content="website" />
    </>
  )
}

export const query = graphql`
  query {
    site {
      siteMetadata {
        title
        description
        author
      }
    }
  }
`

import { Box, Container, Heading, Link, Text } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import PublicPageLayout from "../components/PublicPageLayout"

export const Route = createFileRoute("/about")({
  component: AboutPage,
})

function AboutPage() {
  return (
    <PublicPageLayout>
      <Container margin={0}>
        <Box textStyle="body">
          <Heading as={"h1"} size="2xl" mb={2}>
            About
          </Heading>
          <Text>
            Listening Room is a project created by me,{" "}
            <Link href="https://github.com/albatrocity" target="_blank">
              Ross Brown
            </Link>
            , to facilitate fun. It's a labor of love and learning.
          </Text>
          {import.meta.env.VITE_CONTACT_EMAIL && (
            <Text>
              If you'd like to get in touch you can{" "}
              <Link href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL}?subject=Listening%20Room`}>
                send me an email
              </Link>
              .
            </Text>
          )}
          <Text>
            You can view the source code{" "}
            <Link href="https://github.com/albatrocity/radio-room" target="_blank">
              here
            </Link>
            .
          </Text>
        </Box>
      </Container>
    </PublicPageLayout>
  )
}

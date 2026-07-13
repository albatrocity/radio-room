import { Box, Container, Heading, Link as ChakraLink, Text } from "@chakra-ui/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import PublicPageLayout from "../../components/PublicPageLayout"

export const Route = createFileRoute("/newsletter/confirmed")({
  component: NewsletterConfirmedPage,
})

function NewsletterConfirmedPage() {
  return (
    <PublicPageLayout>
      <Container margin={0}>
        <Box textStyle="body">
          <Heading as="h1" size="2xl" mb={2}>
            You&apos;re subscribed
          </Heading>
          <Text>
            Thanks for confirming your email. You&apos;ll receive Listening Room newsletter updates
            when we send them.
          </Text>
          <Text mt={4}>
            <ChakraLink asChild>
              <Link to="/">Back to Listening Room</Link>
            </ChakraLink>
          </Text>
        </Box>
      </Container>
    </PublicPageLayout>
  )
}

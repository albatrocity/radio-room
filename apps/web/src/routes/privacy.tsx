import { Box, Container, Heading, List, Text } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import PublicPageLayout from "../components/PublicPageLayout"

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <PublicPageLayout>
      <Container margin={0}>
        <Box textStyle="body">
          <Heading as={"h1"} size="2xl" mb={2}>
            Privacy Policy
          </Heading>
          <Text>
            We collect only the data needed to make this app work. All stored data will permenantly
            expire 24 hours after the last activity in the room.
          </Text>
          <Text>
            No collected data is sold, analyzed, or used in any way other than to support the app's
            feature set.
          </Text>
        </Box>
        <Box textStyle="body">
          <Text>We store the following data in our database:</Text>
          <List.Root>
            <List.Item>
              <Text as="strong">Now Playing information</Text>, which is displayed in rooms and
              saved to the room listening history.
            </List.Item>
            <List.Item>
              <Text as="strong">Chat messages and reactions</Text>, which are stored in order to
              populate the chat history when someone joins a room. Chat messages are currently
              stored <Text as="em">unencrypted</Text>. This app should not be used to discuss
              sensitive information.
            </List.Item>
          </List.Root>
          <Heading as="h3" size="md">
            Cookies
          </Heading>
          <Text>
            We use a single cookie containting your auto-generated user ID, username, and a
            connection ID to connect the activity in the app to the data on our servers.
          </Text>
        </Box>
      </Container>
    </PublicPageLayout>
  )
}

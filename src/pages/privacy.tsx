import { Box, Container, Heading, List, ListItem, Text } from "@chakra-ui/react"
import React from "react"
import ConfirmationPopover from "../components/ConfirmationPopover"
import PageLayout from "../components/PageLayout"
import { useAuthStore, useCurrentUser } from "../state/authStore"

type Props = {}

export default function Privacy({}: Props) {
  const { send: authSend } = useAuthStore()
  const currentUser = useCurrentUser()

  return (
    <PageLayout>
      <Container margin={0}>
        <Box textStyle="body">
          <Heading as={"h1"} size="2xl" mb={2}>
            Privacy
          </Heading>
          <Text>
            We collect only the data needed to make this app work. All stored
            data will permenantly expire 24 hours after you leave a room you
            created, or when you disconnect your Spotify account.
          </Text>
          <Text>
            No collected data is sold, analyzed, or used in any way other than
            to support the app's feature set.
          </Text>
        </Box>
        <Box textStyle="body">
          <Text>We store the following data in our database:</Text>
          <List>
            <ListItem>
              Your <Text as="strong">Spotify user ID</Text>, which is used to
              associate rooms with your Spotify account and reserve your
              identity on our servers.
            </ListItem>
            <ListItem>
              Your <Text as="strong">Spotify username</Text>, initially. This is
              overridden any time you change your name in your rooms.
            </ListItem>
            <ListItem>
              Your <Text as="strong">Spotify access token</Text>, which is used
              to make requests to the Spotify API on your behalf.
            </ListItem>
            <ListItem>
              Your <Text as="strong">Spotify refresh token</Text>, which is used
              to get a new access token when it expires.
            </ListItem>
            <ListItem>
              <Text as="strong">Now Playing information</Text> from Spotify,
              which is displayed in your rooms and saved to the room listening
              history. You can manually clear your listening history (the
              "Playlist") at any time.
            </ListItem>
            <ListItem>
              <Text as="strong">Chat messages and reactions</Text>, which are
              stored in order to populate the chat history when someone joins a
              room. Chat messages are currently stored{" "}
              <Text as="em">unencrypted</Text>. You can manually delete this
              data from your rooms at any time. This app should not be used to
              discuss sensitive information.
            </ListItem>
          </List>
          <Heading as="h3" size="md">
            Cookies
          </Heading>
          <Text>
            We use a single cookie containting your user ID (which is your
            Spotify ID if you have authenticated with Spotify, or an
            auto-generated one if you have not), username, and a connection ID
            to connect the activity in the app to the data on our servers.
          </Text>

          <Heading as="h3" size="md">
            Deleting Data
          </Heading>
          <Text>
            Data is permanently deleted when a room expires, when you manually
            delete a room, or when you{" "}
            {currentUser?.userId ? (
              <ConfirmationPopover
                triggerText="disconnect your Spotify account"
                triggerVariant="link"
                onConfirm={() => authSend("NUKE_USER")}
                confirmText="Disconnect Spotify"
                popoverBody={
                  <Text>
                    Are you sure you want to delete all of your rooms and
                    disconnect your Spotify account?
                  </Text>
                }
              />
            ) : (
              <Text as="span">disconnect your Spotify account</Text>
            )}
            . If the data isn't available to you, that means it no longer exists
            on our servers.
          </Text>
        </Box>
      </Container>
    </PageLayout>
  )
}

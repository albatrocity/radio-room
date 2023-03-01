import React from "react"

import {
  Stack,
  Button,
  Heading,
  Icon,
  Show,
  Wrap,
  WrapItem,
  Text,
  useDisclosure,
} from "@chakra-ui/react"

import {
  FiSettings,
  FiList,
  FiImage,
  FiMessageSquare,
  FiBookmark,
} from "react-icons/fi"
import { useSelector } from "@xstate/react"
import useGlobalContext from "./useGlobalContext"
import ConfirmationDialog from "./ConfirmationDialog"

type Props = {}

const isDjSelector = (state) => state.matches("djaying.isDj")
const isNotDjSelector = (state) => state.matches("djaying.notDj")

function AdminPanel({}: Props) {
  const globalServices = useGlobalContext()
  const isDj = useSelector(globalServices.roomService, isDjSelector)
  const isNotDj = useSelector(globalServices.roomService, isNotDjSelector)
  const bookmarks = useSelector(
    globalServices.bookmarkedChatService,
    (state) => state.context.collection,
  )
  const { isOpen, onOpen, onClose } = useDisclosure()

  return (
    <Show above="sm">
      <ConfirmationDialog
        body={
          <Text>
            Are you sure you want to clear the chat? This cannot be undone.
          </Text>
        }
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={() => {
          globalServices.chatService.send("CLEAR_MESSAGES")
          onClose()
        }}
        isDangerous={true}
        confirmLabel="Clear Chat"
      />
      <Stack
        direction="column"
        p={3}
        borderTopWidth={1}
        borderTopColor="secondaryBorder"
        background="actionBg"
        width="100%"
      >
        <Heading
          as="h3"
          size="md"
          color="whiteAlpha.700"
          margin={{ bottom: "xsmall" }}
        >
          Admin
        </Heading>
        {isDj && (
          <WrapItem>
            <Button
              onClick={() => globalServices.roomService.send("EDIT_QUEUE")}
            >
              Add to queue
            </Button>
          </WrapItem>
        )}

        {isNotDj && (
          <WrapItem>
            <Button
              onClick={() =>
                globalServices.roomService.send("START_DJ_SESSION")
              }
              variant="solid"
            >
              I am the DJ
            </Button>
          </WrapItem>
        )}
        <Wrap>
          <WrapItem>
            <Button
              size="xs"
              variant="ghost"
              colorScheme="whiteAlpha"
              leftIcon={<Icon as={FiImage} />}
              onClick={() =>
                globalServices.roomService.send("ADMIN_EDIT_ARTWORK")
              }
            >
              Change Cover Art
            </Button>
          </WrapItem>

          <WrapItem>
            <Button
              size="xs"
              variant="ghost"
              colorScheme="whiteAlpha"
              leftIcon={<Icon as={FiBookmark} />}
              onClick={() => globalServices.roomService.send("ADMIN_BOOKMARKS")}
            >
              Bookmarks {bookmarks.length > 0 ? `(${bookmarks.length})` : ""}
            </Button>
          </WrapItem>

          <WrapItem>
            <Button
              size="xs"
              variant="ghost"
              colorScheme="whiteAlpha"
              leftIcon={<Icon as={FiSettings} />}
              onClick={() =>
                globalServices.roomService.send("ADMIN_EDIT_SETTINGS")
              }
            >
              Settings
            </Button>
          </WrapItem>
          <WrapItem>
            <Button
              size="xs"
              variant="solid"
              colorScheme="red"
              leftIcon={<Icon as={FiMessageSquare} />}
              onClick={onOpen}
            >
              Clear Chat
            </Button>
          </WrapItem>

          <WrapItem>
            <Button
              size="xs"
              variant="solid"
              colorScheme="red"
              leftIcon={<Icon as={FiList} />}
              onClick={() => {
                const confirmation = window.confirm(
                  "Are you sure you want to clear the playlist? This cannot be undone.",
                )
                if (confirmation) {
                  globalServices.roomService.send("ADMIN_CLEAR_PLAYLIST")
                }
              }}
            >
              Clear Playlist
            </Button>
          </WrapItem>
          {isDj && (
            <WrapItem>
              <Button
                size="xs"
                variant="ghost"
                colorScheme="whiteAlpha"
                onClick={() =>
                  globalServices.roomService.send("END_DJ_SESSION")
                }
              >
                End DJ Session
              </Button>
            </WrapItem>
          )}
        </Wrap>
      </Stack>
    </Show>
  )
}

export default AdminPanel

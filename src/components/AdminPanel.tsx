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
  useColorModeValue,
} from "@chakra-ui/react"

import { FiSettings, FiList, FiBookmark } from "react-icons/fi"
import { BiMessageRoundedMinus } from "react-icons/bi"
import ConfirmationDialog from "./ConfirmationDialog"

import { useChatStore } from "../state/chatStore"
import { useBookmarks } from "../state/bookmarkedChatStore"
import { useModalsStore } from "../state/modalsState"
import { useAdminStore } from "../state/adminStore"
import { useDjStore } from "../state/djStore"

type Props = {}

function AdminPanel({}: Props) {
  const { send: chatSend } = useChatStore()
  const { send: adminSend } = useAdminStore()
  const { send: djSend } = useDjStore()
  const { send: modalSend } = useModalsStore()
  const { onClose, isOpen, getButtonProps, getDisclosureProps } =
    useDisclosure()
  const {
    onClose: onClosePlaylist,
    isOpen: isPlaylistOpen,
    getButtonProps: getButtonPropsPlaylist,
    getDisclosureProps: getDisclosurePropsPlaylist,
  } = useDisclosure()

  const isDj = useDjStore((s) => s.state.matches("djaying"))
  const bookmarks = useBookmarks()
  const buttonColorScheme = useColorModeValue("whiteAlpha", undefined)

  return (
    <Show above="sm">
      <ConfirmationDialog
        title="Clear Chat Messages?"
        body={
          <Text>
            Are you sure you want to clear the chat? This cannot be undone.
            Triggers based on messages will be reset.
          </Text>
        }
        onClose={onClose}
        isOpen={isOpen}
        onConfirm={() => {
          chatSend("CLEAR_MESSAGES")
          onClose()
        }}
        isDangerous={true}
        confirmLabel="Clear Chat"
        {...getDisclosureProps()}
      />
      <ConfirmationDialog
        title="Clear Playlist?"
        body={
          <Text>
            Are you sure you want to clear the playlist? This cannot be undone.
            Triggers based on tracks will be reset.
          </Text>
        }
        isOpen={isPlaylistOpen}
        onClose={onClosePlaylist}
        onConfirm={() => {
          adminSend("CLEAR_PLAYLIST")
          onClose()
        }}
        isDangerous={true}
        confirmLabel="Clear Playlist"
        {...getDisclosurePropsPlaylist()}
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

        <Wrap>
          <WrapItem>
            <Button
              size="xs"
              variant="ghost"
              colorScheme={buttonColorScheme}
              leftIcon={<Icon as={FiSettings} />}
              onClick={() => modalSend("EDIT_SETTINGS")}
            >
              Settings
            </Button>
          </WrapItem>
          <WrapItem>
            <Button
              size="xs"
              variant="ghost"
              colorScheme={buttonColorScheme}
              leftIcon={<Icon as={FiBookmark} />}
              onClick={() => modalSend("VIEW_BOOKMARKS")}
            >
              Bookmarks {bookmarks.length > 0 ? `(${bookmarks.length})` : ""}
            </Button>
          </WrapItem>
        </Wrap>
        <Wrap>
          <WrapItem>
            <Button
              size="xs"
              variant="solid"
              colorScheme="red"
              leftIcon={<Icon as={BiMessageRoundedMinus} />}
              {...getButtonProps()}
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
              {...getButtonPropsPlaylist()}
            >
              Clear Playlist
            </Button>
          </WrapItem>
          {isDj && (
            <WrapItem>
              <Button
                size="xs"
                variant="ghost"
                colorScheme={buttonColorScheme}
                onClick={() => djSend("END_DJ_SESSION")}
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

import React from "react"
import { Button, Box, Icon, Text, useDisclosure } from "@chakra-ui/react"
import { FiTrash2 } from "react-icons/fi"

import BookmarkedMessages from "../BookmarkedMessages"
import Drawer from "../Drawer"
import ConfirmationDialog from "../ConfirmationDialog"

import { useAuthStore } from "../../state/authStore"
import {
  useBookmarkedChatStore,
  useBookmarks,
} from "../../state/bookmarkedChatStore"
import { useModalsStore } from "../../state/modalsState"

const DrawerBookmarks = () => {
  const isAdmin = useAuthStore((s) => s.state.context.isAdmin)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const { send } = useModalsStore()
  const isModalViewingBookmarks = useModalsStore((s) =>
    s.state.matches("bookmarks"),
  )
  const { send: bookmarkSend } = useBookmarkedChatStore()
  const messages = useBookmarks()

  const hideBookmarks = () => send("CLOSE")
  const clearBookmarks = () => bookmarkSend("CLEAR")

  if (!isAdmin) return null

  return (
    <>
      <ConfirmationDialog
        body={
          <Text>
            Are you sure you want to clear all bookmarked messages? This cannot
            be undone.
          </Text>
        }
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={clearBookmarks}
        isDangerous={true}
        confirmLabel="Clear Bookmarks"
      />
      <Drawer
        isOpen={isModalViewingBookmarks}
        isFullHeight
        heading={`Bookmarks`}
        size={["sm", "md"]}
        onClose={() => hideBookmarks()}
        footer={
          messages.length > 0 && (
            <Button
              leftIcon={<Icon as={FiTrash2} />}
              colorScheme="red"
              variant="ghost"
              onClick={onOpen}
            >
              Clear Bookmarks
            </Button>
          )
        }
      >
        <Box p="sm" overflow="auto" h="100%">
          {messages.length > 0 ? (
            <BookmarkedMessages />
          ) : (
            <Text fontSize="sm">
              Click the bookmark icon on a message to save it here. While the
              chat gets periodically dumped, bookmarked messages will persist to
              your browser session.
            </Text>
          )}
        </Box>
      </Drawer>
    </>
  )
}

export default DrawerBookmarks

import React, { useCallback } from "react"
import { Button, Box, Icon, Text, useDisclosure } from "@chakra-ui/react"
import { FiTrash2 } from "react-icons/fi"
import { useSelector } from "@xstate/react"

import BookmarkedMessages from "../BookmarkedMessages"
import Drawer from "../Drawer"
import useGlobalContext from "../useGlobalContext"
import ConfirmationDialog from "../ConfirmationDialog"

const isAdminSelector = (state) => state.context.isAdmin
const isModalViewingBookmarksSelector = (state) =>
  state.matches("connected.participating.editing.bookmarks")

const DrawerBookmarks = () => {
  const globalServices = useGlobalContext()
  const isAdmin = useSelector(globalServices.authService, isAdminSelector)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const isModalViewingBookmarks = useSelector(
    globalServices.roomService,
    isModalViewingBookmarksSelector,
  )
  const messages = useSelector(
    globalServices.bookmarkedChatService,
    (state) => state.context.collection,
  )

  const hideBookmarks = useCallback(
    () => globalServices.roomService.send("CLOSE_EDIT"),
    [globalServices],
  )
  const clearBookmarks = useCallback(
    () => globalServices.bookmarkedChatService.send("CLEAR"),
    [globalServices],
  )

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
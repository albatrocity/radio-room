import React from "react"
import { Button, Box, Icon, Text, useDisclosure } from "@chakra-ui/react"
import { FiTrash2 } from "react-icons/fi"

import BookmarkedMessages from "../BookmarkedMessages"
import Drawer from "../Drawer"
import ConfirmationDialog from "../ConfirmationDialog"

import {
  useIsAdmin,
  useBookmarks,
  useBookmarksSend,
  useModalsSend,
  useIsModalOpen,
} from "../../hooks/useActors"

const DrawerBookmarks = () => {
  const isAdmin = useIsAdmin()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const modalSend = useModalsSend()
  const isModalViewingBookmarks = useIsModalOpen("bookmarks")
  const bookmarkSend = useBookmarksSend()
  const messages = useBookmarks()

  const hideBookmarks = () => modalSend({ type: "CLOSE" })
  const clearBookmarks = () => bookmarkSend({ type: "CLEAR" })

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
              Click the bookmark icon on a message to save it here.
            </Text>
          )}
        </Box>
      </Drawer>
    </>
  )
}

export default DrawerBookmarks

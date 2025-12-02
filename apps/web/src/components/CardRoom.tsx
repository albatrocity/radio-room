import { LuTrash2, LuMoreHorizontal } from "react-icons/lu"
import {
  Button,
  Card,
  Heading,
  HStack,
  IconButton,
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
  Text,
  VStack,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import React, { useState } from "react"
import { Room } from "../types/Room"
import ConfirmationDialog from "./ConfirmationDialog"
import ParsedEmojiMessage from "./ParsedEmojiMessage"

type Props = Omit<Room, "password"> & {
  onDelete: (roomId: string) => void
}

export default function CardRoom({ title, extraInfo, id, onDelete }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <>
      <ConfirmationDialog
        isDangerous
        open={isOpen}
        confirmLabel="Delete Room"
        onConfirm={() => onDelete(id)}
        onClose={() => setIsOpen(false)}
        title={`Delete ${title}`}
        body={
          <Text>
            Are you sure you want to delete this room? The playlist, chat
            history, and reactions will be gone forever. You cannot undo this.
          </Text>
        }
      />
      <Card.Root>
        <Card.Header>
          <HStack justifyContent="space-between" gap={2}>
            <Heading size="md">{title}</Heading>
            <MenuRoot>
              <MenuTrigger asChild>
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label="Options"
                >
                  <LuMoreHorizontal />
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                <MenuItem
                  value="delete"
                  onClick={() => setIsOpen(true)}
                  color="red.500"
                >
                  <HStack gap={2}>
                    <LuTrash2 /> <Text>Delete</Text>
                  </HStack>
                </MenuItem>
              </MenuContent>
            </MenuRoot>
          </HStack>
        </Card.Header>
        <Card.Body>
          <VStack gap={2} align="stretch">
            {extraInfo && <ParsedEmojiMessage content={extraInfo} />}
            <Button asChild>
              <Link to={`/rooms/${id}`}>Join</Link>
            </Button>
          </VStack>
        </Card.Body>
      </Card.Root>
    </>
  )
}

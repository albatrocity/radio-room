import { DeleteIcon } from "@chakra-ui/icons"
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  useDisclosure,
  VStack,
} from "@chakra-ui/react"
import { Link } from "gatsby"
import React from "react"
import { FiMoreHorizontal } from "react-icons/fi"
import { Room } from "../types/Room"
import ConfirmationDialog from "./ConfirmationDialog"
import ParsedEmojiMessage from "./ParsedEmojiMessage"

type Props = Omit<Room, "password"> & {
  onDelete: (roomId: string) => void
}

export default function CardRoom({ title, extraInfo, id, onDelete }: Props) {
  const { onClose, isOpen, getButtonProps } = useDisclosure()
  return (
    <>
      <ConfirmationDialog
        isDangerous
        isOpen={isOpen}
        confirmLabel="Delete Room"
        onConfirm={() => onDelete(id)}
        onClose={() => onClose()}
        title={`Delete ${title}`}
        body={
          <Text>
            Are you sure you want to delete this room? The playlist, chat
            history, and reactions will be gone forever. You cannot undo this.
          </Text>
        }
      />
      <Card>
        <CardHeader>
          <HStack justifyContent="space-between" spacing={2}>
            <Heading size="md">{title}</Heading>
            <Menu>
              <MenuButton
                icon={<FiMoreHorizontal />}
                as={IconButton}
                variant="ghost"
                size="sm"
              />
              <MenuList>
                <MenuItem {...getButtonProps()}>
                  <HStack spacing={2} color="red.500">
                    <DeleteIcon /> <Text>Delete</Text>
                  </HStack>
                </MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </CardHeader>
        <CardBody>
          <VStack spacing={2} align="stretch">
            {extraInfo && <ParsedEmojiMessage content={extraInfo} />}
            <Button as={Link} to={`/rooms/${id}`}>
              Join
            </Button>
          </VStack>
        </CardBody>
      </Card>
    </>
  )
}

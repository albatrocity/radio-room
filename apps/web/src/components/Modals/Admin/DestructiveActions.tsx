import React from "react"
import {
  Wrap,
  WrapItem,
  Button,
  Icon,
  Text,
  useColorModeValue,
} from "@chakra-ui/react"

import { useChatStore } from "../../../state/chatStore"
import { useAdminStore } from "../../../state/adminStore"
import { useDjStore } from "../../../state/djStore"
import { BiMessageRoundedMinus } from "react-icons/bi"
import { FiList } from "react-icons/fi"
import ConfirmationPopover from "../../ConfirmationPopover"
import { DeleteIcon } from "@chakra-ui/icons"
import { useCurrentRoom } from "../../../state/roomStore"

export default function DestructiveActions() {
  const { send: chatSend } = useChatStore()
  const { send: adminSend } = useAdminStore()
  const { send: djSend } = useDjStore()
  const room = useCurrentRoom()
  const buttonColorScheme = useColorModeValue("whiteAlpha", undefined)

  const isDj = useDjStore((s) => s.state.matches("djaying"))

  return (
    <>
      <Wrap>
        <WrapItem>
          <ConfirmationPopover
            triggerText="Clear Chat"
            triggerIcon={<Icon as={BiMessageRoundedMinus} />}
            triggerVariant="outline"
            onConfirm={() => chatSend("CLEAR_MESSAGES")}
            confirmText="Clear Chat"
            popoverBody={
              <Text>
                Are you sure you want to clear the chat? This cannot be undone.
              </Text>
            }
          />
        </WrapItem>

        <WrapItem>
          <ConfirmationPopover
            triggerText="Clear Playlist"
            triggerIcon={<Icon as={FiList} />}
            triggerVariant="outline"
            onConfirm={() => adminSend("CLEAR_PLAYLIST")}
            confirmText="Clear Playlist"
            popoverBody={
              <Text>
                Are you sure you want to clear the playlist? This cannot be
                undone.
              </Text>
            }
          />
        </WrapItem>

        {room && (
          <WrapItem>
            <ConfirmationPopover
              triggerColorScheme="red"
              triggerText="Delete Room"
              triggerIcon={<DeleteIcon />}
              triggerVariant="outline"
              onConfirm={() =>
                adminSend("DELETE_ROOM", { data: { id: room.id } })
              }
              confirmText="Delete Room"
              popoverBody={
                <Text>
                  Are you sure you want to delete this room and all of its data?
                  This cannot be undone.
                </Text>
              }
            />
          </WrapItem>
        )}
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
    </>
  )
}

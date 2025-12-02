import React from "react"
import {
  Wrap,
  Button,
  Icon,
  Text,
} from "@chakra-ui/react"

import { useChatStore } from "../../../state/chatStore"
import { useAdminStore } from "../../../state/adminStore"
import { useDjStore } from "../../../state/djStore"
import { BiMessageRoundedMinus } from "react-icons/bi"
import { FiList } from "react-icons/fi"
import { LuTrash2 } from "react-icons/lu"
import ConfirmationPopover from "../../ConfirmationPopover"
import { useCurrentRoom } from "../../../state/roomStore"
import { useColorModeValue } from "../../ui/color-mode"

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

        {room && (
          <ConfirmationPopover
            triggerColorScheme="red"
            triggerText="Delete Room"
            triggerIcon={<LuTrash2 />}
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
        )}
        {isDj && (
          <Button
            size="xs"
            variant="ghost"
            colorPalette={buttonColorScheme}
            onClick={() => djSend("END_DJ_SESSION")}
          >
            End DJ Session
          </Button>
        )}
      </Wrap>
    </>
  )
}

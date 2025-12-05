import React from "react"
import { Wrap, Button, Icon, Text } from "@chakra-ui/react"

import { BiMessageRoundedMinus } from "react-icons/bi"
import { FiList } from "react-icons/fi"
import { LuTrash2 } from "react-icons/lu"
import ConfirmationPopover from "../../ConfirmationPopover"
import { useColorModeValue } from "../../ui/color-mode"
import {
  useChatSend,
  useAdminSend,
  useDjSend,
  useIsDjaying,
  useCurrentRoom,
} from "../../../hooks/useActors"

export default function DestructiveActions() {
  const chatSend = useChatSend()
  const adminSend = useAdminSend()
  const djSend = useDjSend()
  const room = useCurrentRoom()
  const buttonColorScheme = useColorModeValue("whiteAlpha", undefined)

  const isDj = useIsDjaying()

  return (
    <>
      <Wrap>
        <ConfirmationPopover
          triggerText="Clear Chat"
          triggerIcon={<Icon as={BiMessageRoundedMinus} />}
          triggerVariant="outline"
          onConfirm={() => chatSend({ type: "CLEAR_MESSAGES" })}
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
          onConfirm={() => adminSend({ type: "CLEAR_PLAYLIST" })}
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
              adminSend({ type: "DELETE_ROOM", data: { id: room.id } })
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
            onClick={() => djSend({ type: "END_DJ_SESSION" })}
          >
            End DJ Session
          </Button>
        )}
      </Wrap>
    </>
  )
}

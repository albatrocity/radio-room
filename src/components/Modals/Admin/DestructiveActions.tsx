import React from "react"
import {
  Wrap,
  WrapItem,
  Button,
  Icon,
  Text,
  useDisclosure,
  useColorModeValue,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverArrow,
  PopoverCloseButton,
  PopoverAnchor,
} from "@chakra-ui/react"

import ConfirmationDialog from "../../ConfirmationDialog"
import { useChatStore } from "../../../state/chatStore"
import { useAdminStore } from "../../../state/adminStore"
import { useDjStore } from "../../../state/djStore"
import { BiMessageRoundedMinus } from "react-icons/bi"
import { FiList } from "react-icons/fi"
import ConfirmationPopover from "../../ConfirmationPopover"

export default function DestructiveActions() {
  const { send: chatSend } = useChatStore()
  const { send: adminSend } = useAdminStore()
  const { send: djSend } = useDjStore()
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
                Triggers based on messages will be reset.
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
                undone. Triggers based on tracks will be reset.
              </Text>
            }
          />
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
    </>
  )
}

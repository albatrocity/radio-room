import React from "react"

import {
  Stack,
  Button,
  Heading,
  Icon,
  Show,
  Wrap,
  WrapItem,
} from "@chakra-ui/react"

import { FiSettings, FiList, FiImage } from "react-icons/fi"
import { useSelector } from "@xstate/react"
import useGlobalContext from "./useGlobalContext"

type Props = {}

const isDjSelector = (state) => state.matches("djaying.isDj")
const isNotDjSelector = (state) => state.matches("djaying.notDj")
const isEditingSettingsSelector = (state) =>
  state.matches("connected.participating.editing.settings")

function AdminPanel({}: Props) {
  const globalServices = useGlobalContext()
  const isDj = useSelector(globalServices.roomService, isDjSelector)
  const isNotDj = useSelector(globalServices.roomService, isNotDjSelector)
  const isEditingSettings = useSelector(
    globalServices.roomService,
    isEditingSettingsSelector,
  )

  return (
    <Show above="sm">
      <Stack
        direction="column"
        p={3}
        borderTopWidth={1}
        background="actionBg"
        width="100%"
      >
        <Heading as="h3" size="md" margin={{ bottom: "xsmall" }}>
          Admin
        </Heading>

        {isNotDj && (
          <WrapItem>
            <Button
              onClick={() =>
                globalServices.roomService.send("START_DJ_SESSION")
              }
              variant="solid"
            >
              I am the DJ
            </Button>
          </WrapItem>
        )}
        <Wrap>
          <WrapItem>
            <Button
              size="xs"
              variant="outline"
              leftIcon={<Icon as={FiImage} />}
              onClick={() =>
                globalServices.roomService.send("ADMIN_EDIT_ARTWORK")
              }
            >
              Change Cover Art
            </Button>
          </WrapItem>

          <WrapItem>
            <Button
              size="xs"
              variant="outline"
              leftIcon={<Icon as={FiSettings} />}
              onClick={() =>
                globalServices.roomService.send("ADMIN_EDIT_SETTINGS")
              }
            >
              Settings
            </Button>
          </WrapItem>
          {isDj && (
            <>
              <WrapItem>
                <Button
                  size="xs"
                  variant="solid"
                  colorScheme="red"
                  leftIcon={<Icon as={FiList} />}
                  onClick={() => {
                    const confirmation = window.confirm(
                      "Are you sure you want to clear the playlist? This cannot be undone.",
                    )
                    if (confirmation) {
                      globalServices.roomService.send("ADMIN_CLEAR_PLAYLIST")
                    }
                  }}
                >
                  Clear Playlist
                </Button>
              </WrapItem>
              <WrapItem>
                <Button
                  size="xs"
                  onClick={() =>
                    globalServices.roomService.send("END_DJ_SESSION")
                  }
                >
                  End DJ Session
                </Button>
              </WrapItem>
            </>
          )}
        </Wrap>
      </Stack>
    </Show>
  )
}

export default AdminPanel

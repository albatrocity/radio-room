import React, { useCallback, useEffect, useState } from "react"
import {
  Box,
  Button,
  HStack,
  Text,
  Link,
  useBoolean,
  useConst,
  useToast,
} from "@chakra-ui/react"
import { format } from "date-fns"

import Drawer from "./Drawer"
import useGlobalContext from "./useGlobalContext"
import SelectablePlaylist from "./SelectablePlaylist"
import { PlaylistItem } from "../types/PlaylistItem"
import { useActor } from "@xstate/react"

type Props = { isOpen: boolean }

function Controls({
  isEditing,
  onEdit,
  onSave,
  isLoading,
}: {
  isEditing: boolean
  onEdit: () => void
  onSave: () => void
  isLoading: boolean
}) {
  return (
    <Box>
      {isEditing ? (
        <HStack>
          <Button onClick={onEdit} variant="outline">
            Cancel
          </Button>
          <Button onClick={onSave} isLoading={isLoading} isDisabled={isLoading}>
            Save
          </Button>
        </HStack>
      ) : (
        <Button onClick={onEdit}>Save Playlist</Button>
      )}
    </Box>
  )
}

function DrawerPlaylist({ isOpen }: Props) {
  const toast = useToast()
  const defaultPlaylistName = useConst(
    () => `Radio Playlist ${format(new Date(), "M/d/y")}`,
  )
  const [isEditing, { toggle, off }] = useBoolean(false)
  const [selected, setSelected] = useState<PlaylistItem[]>([])
  const [name, setName] = useState<string>(defaultPlaylistName)
  const globalServices = useGlobalContext()
  const [roomState] = useActor(globalServices.roomService)

  const isAdmin = roomState.matches("admin.isAdmin")
  const isLoading = roomState.matches("playlist.active.loading")

  const handleSelectionChange = (collection: PlaylistItem[]) =>
    setSelected(collection)
  const handleNameChange = (name: string) => setName(name)
  const handleTogglePlaylist = useCallback(
    () => globalServices.roomService.send("TOGGLE_PLAYLIST"),
    [globalServices.roomService],
  )
  const handleSave = useCallback(() => {
    globalServices.roomService.send("ADMIN_SAVE_PLAYLIST", {
      name,
      uris: selected
        .map(({ spotifyData }) => spotifyData?.uri)
        .filter((x) => !!x),
    })
  }, [globalServices.roomService, selected, name])

  useEffect(() => {
    if (!isOpen) {
      off()
    }
  }, [isOpen])

  useEffect(() => {
    if (roomState.matches("playlist.active.success")) {
      console.log(roomState.context.playlistMeta)

      toast({
        title: "Playlist created",
        description: (
          <Text>
            <Link
              href={roomState.context.playlistMeta?.external_urls?.spotify}
              isExternal
              textDecoration={"underline"}
            >
              {roomState.context.playlistMeta.name}
            </Link>{" "}
            was added to your Spotify Collection
          </Text>
        ),
        status: "success",
        duration: 4000,
        isClosable: true,
        position: "top",
      })
    }
    if (roomState.matches("playlist.active.error")) {
      toast({
        title: "Playlist failed",
        description: <Text>{String(roomState.context.playlistError)}</Text>,
        status: "error",
        duration: 4000,
        isClosable: true,
        position: "top",
      })
    }
  }, [roomState])

  return (
    <Drawer
      isOpen={isOpen}
      placement="left"
      heading="Playlist"
      size={["full", "lg"]}
      onClose={handleTogglePlaylist}
      footer={
        isAdmin && (
          <Controls
            isEditing={isEditing}
            onEdit={() => toggle()}
            onSave={handleSave}
            onChange={handleNameChange}
            isLoading={isLoading}
          />
        )
      }
      isFullHeight
    >
      <SelectablePlaylist
        isSelectable={isEditing}
        onChange={handleSelectionChange}
      />
    </Drawer>
  )
}

export default DrawerPlaylist

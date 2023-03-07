import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  Box,
  Button,
  HStack,
  Text,
  Link,
  useBoolean,
  useConst,
  useToast,
  Input,
} from "@chakra-ui/react"
import { format } from "date-fns"

import Drawer from "./Drawer"
import useGlobalContext from "./useGlobalContext"
import SelectablePlaylist from "./SelectablePlaylist"
import { PlaylistItem } from "../types/PlaylistItem"
import { savePlaylistMachine } from "../machines/savePlaylistMachine"
import { useActor, useMachine } from "@xstate/react"

type Props = { isOpen: boolean }

function Controls({
  isEditing,
  onEdit,
  onSave,
  isLoading,
  onChange,
  value,
}: {
  isEditing: boolean
  onEdit: () => void
  onSave: () => void
  isLoading: boolean
  onChange: (name: string) => void
  value: string | undefined
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing, inputRef.current])
  return (
    <form onSubmit={onSave}>
      <Box w="100%">
        {isEditing ? (
          <HStack justifyContent="space-between">
            <Button onClick={onEdit} variant="ghost">
              Cancel
            </Button>
            <HStack>
              <Input
                name="name"
                placeholder="Playlist name"
                autoFocus
                value={value}
                onChange={(e) => onChange(e.target.value)}
                ref={inputRef}
              />
              <Button
                onClick={onSave}
                isLoading={isLoading}
                isDisabled={isLoading}
                type="submit"
              >
                Save
              </Button>
            </HStack>
          </HStack>
        ) : (
          <HStack justifyContent="end">
            <Button variant="outline" onClick={onEdit}>
              Save Playlist
            </Button>
          </HStack>
        )}
      </Box>
    </form>
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
  const [state, send] = useMachine(savePlaylistMachine)

  const isAdmin = roomState.matches("admin.isAdmin")
  const isLoading = state.matches("loading")

  const handleSelectionChange = (collection: PlaylistItem[]) =>
    setSelected(collection)
  const handleNameChange = (name: string) => setName(name)
  const handleTogglePlaylist = useCallback(
    () => globalServices.roomService.send("TOGGLE_PLAYLIST"),
    [globalServices.roomService],
  )
  const handleSave = useCallback(() => {
    send("ADMIN_SAVE_PLAYLIST", {
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
    if (state.matches("success")) {
      toast({
        title: "Playlist created",
        description: (
          <Text>
            <Link
              href={state.context.playlistMeta?.external_urls?.spotify}
              isExternal
              textDecoration={"underline"}
            >
              {state.context.playlistMeta?.name}
            </Link>{" "}
            was added to your Spotify Collection
          </Text>
        ),
        status: "success",
        duration: 4000,
        isClosable: true,
        position: "top",
      })
      off()
    }
    if (state.matches("error")) {
      toast({
        title: "Playlist failed",
        description: <Text>{String(state.context.playlistError)}</Text>,
        status: "error",
        duration: 4000,
        isClosable: true,
        position: "top",
      })
    }
  }, [state])

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
            value={name}
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

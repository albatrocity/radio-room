import React, { FormEvent, useCallback, useEffect, useState } from "react"
import {
  Box,
  Button,
  HStack,
  Text,
  Link,
  useBoolean,
  useConst,
  useToast,
  VStack,
} from "@chakra-ui/react"
import { format } from "date-fns"
import { useMachine } from "@xstate/react"

import Drawer from "../Drawer"
import DrawerPlaylistFooter from "./DrawerPlaylistFooter"
import PlaylistFilters from "../PlaylistFilters"
import usePlaylistFilter from "../usePlaylistFilter"

import { savePlaylistMachine } from "../../machines/savePlaylistMachine"
import { toggleableCollectionMachine } from "../../machines/toggleableCollectionMachine"
import { useCurrentPlaylist, usePlaylistStore } from "../../state/playlistStore"

import { Dictionary } from "../../types/Dictionary"
import { Reaction } from "../../types/Reaction"
import { PlaylistItem } from "../../types/PlaylistItem"
import { Emoji } from "../../types/Emoji"
import PlaylistWindow from "../PlaylistWindow"
import {
  useIsSpotifyAuthenticated,
  useSpotifyAccessToken,
} from "../../state/spotifyAuthStore"
import { useIsAdmin } from "../../state/authStore"

function DrawerPlaylist() {
  const { send: playlistSend } = usePlaylistStore()
  const currentPlaylist = useCurrentPlaylist()
  const isLoggedIn = useIsSpotifyAuthenticated()
  const accessToken = useSpotifyAccessToken()
  const isAdmin = useIsAdmin()
  const [isEditing, { toggle, off }] = useBoolean(false)
  const defaultPlaylistName = useConst(
    () => `Radio Playlist ${format(new Date(), "M/d/y")}`,
  )
  const [name, setName] = useState<string>(defaultPlaylistName)
  const [state, send] = useMachine(savePlaylistMachine, {
    context: {
      accessToken,
    },
  })
  const [filterState, filterSend] = useMachine(toggleableCollectionMachine, {
    context: {
      idPath: "shortcodes",
      name: "playlistFilters",
      persistent: false,
    },
  })
  const isOpen = usePlaylistStore((s) => s.state.matches("active"))
  const toast = useToast()
  const isLoading = state.matches("loading")
  const canSave = isLoggedIn || isAdmin

  const emojis = filterState.context.collection.reduce((mem, emoji) => {
    mem[emoji.shortcodes] = [
      {
        emoji: emoji.shortcodes,
        type: "track",
        id: emoji.shortcodes,
      },
    ]
    return mem
  }, {} as Dictionary<Reaction[]>)
  const filterPlaylist = usePlaylistFilter(currentPlaylist)

  const filteredPlaylistItems = filterState.context.collection.length
    ? filterPlaylist(emojis)
    : currentPlaylist

  const [selectedPlaylistState, selectedPlaylistSend] = useMachine(
    toggleableCollectionMachine,
    {
      context: {
        collection: currentPlaylist,
        persistent: false,
        name: "playlist-selected",
        idPath: "spotifyData.uri",
      },
    },
  )

  const handleSelectionChange = (item: PlaylistItem) => {
    selectedPlaylistSend("TOGGLE_ITEM", {
      data: { ...item, id: item.spotifyData?.uri },
    })
  }
  const handleNameChange = (name: string) => setName(name)
  const handleFilterChange = (emoji: Emoji) => {
    filterSend("TOGGLE_ITEM", { data: emoji })
  }
  const handleTogglePlaylist = useCallback(
    () => playlistSend("TOGGLE_PLAYLIST"),
    [playlistSend],
  )
  const handleSave = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const event = isAdmin ? "ADMIN_SAVE_PLAYLIST" : "SAVE_PLAYLIST"
      send(event, {
        name,
        uris: selectedPlaylistState.context.collection
          .map(({ spotifyData }) => spotifyData?.uri)
          .filter((x) => !!x),
      })
      return void 0
    },
    [send, selectedPlaylistState.context.collection, name],
  )
  const handleSelect = (selection: "all" | "none" | "filtered") => {
    switch (selection) {
      case "all":
        return selectedPlaylistSend("SET_ITEMS", { data: currentPlaylist })
      case "none":
        return selectedPlaylistSend("CLEAR")
      case "filtered":
        return selectedPlaylistSend("ADD_ITEMS", {
          data: filteredPlaylistItems,
        })
    }
  }

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
  }, [state.value])

  return (
    <Drawer
      isOpen={isOpen}
      placement="left"
      heading="Playlist"
      size={["full", "lg"]}
      onClose={handleTogglePlaylist}
      footer={
        canSave && (
          <DrawerPlaylistFooter
            isEditing={isEditing}
            onEdit={() => toggle()}
            onSave={handleSave}
            onChange={handleNameChange}
            isLoading={isLoading}
            value={name}
            trackCount={selectedPlaylistState.context.collection.length}
          />
        )
      }
      isFullHeight
    >
      <VStack w="100%" h="100%" spacing={4}>
        <Box w="100%" bg="primaryBg" px={4} py={2} borderRadius={4}>
          <PlaylistFilters onChange={handleFilterChange} emojis={emojis} />
        </Box>
        {isEditing && (
          <HStack w="100%" justify="flex-end">
            {filterState.context.collection.length > 0 && (
              <Button
                onClick={() => handleSelect("filtered")}
                size="sm"
                variant="ghost"
                isDisabled={
                  currentPlaylist.length ===
                  selectedPlaylistState.context.collection.length
                }
              >
                Add {filteredPlaylistItems.length} Filtered
              </Button>
            )}
            <Button
              onClick={() => handleSelect("all")}
              size="sm"
              variant="ghost"
              isDisabled={
                currentPlaylist.length ===
                selectedPlaylistState.context.collection.length
              }
            >
              Select All {currentPlaylist.length}
            </Button>
            <Button
              onClick={() => handleSelect("none")}
              size="sm"
              variant="ghost"
              isDisabled={selectedPlaylistState.context.collection.length === 0}
            >
              Deselect All
            </Button>
          </HStack>
        )}
        {isOpen && (
          <Box w="100%" h="100%">
            <PlaylistWindow
              selected={selectedPlaylistState.context.collection}
              isSelectable={isEditing}
              onSelect={handleSelectionChange}
              playlist={filteredPlaylistItems}
            />
          </Box>
        )}
      </VStack>
    </Drawer>
  )
}

export default DrawerPlaylist

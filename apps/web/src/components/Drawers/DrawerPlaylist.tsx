import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react"
import { Box, Button, HStack, Text, Link, VStack } from "@chakra-ui/react"
import { format } from "date-fns"
import { useMachine } from "@xstate/react"

import Drawer from "../Drawer"
import DrawerPlaylistFooter from "./DrawerPlaylistFooter"
import PlaylistFilters from "../PlaylistFilters"
import usePlaylistFilter from "../usePlaylistFilter"

import { savePlaylistMachine } from "../../machines/savePlaylistMachine"
import { toggleableCollectionMachine } from "../../machines/toggleableCollectionMachine"
import { useCurrentPlaylist, usePlaylistStore } from "../../state/playlistStore"
import { toast } from "../../lib/toasts"

import { Dictionary } from "../../types/Dictionary"
import { Reaction } from "../../types/Reaction"
import { PlaylistItem } from "../../types/PlaylistItem"
import { Emoji } from "../../types/Emoji"
import PlaylistWindow from "../PlaylistWindow"
import { useIsAdmin } from "../../state/authStore"
import { useCurrentRoom } from "../../state/roomStore"

function DrawerPlaylist() {
  const { send: playlistSend } = usePlaylistStore()
  const currentPlaylist = useCurrentPlaylist()
  const isAdmin = useIsAdmin()
  const [isEditing, setIsEditing] = useState(false)
  const room = useCurrentRoom()
  const todayRef = useRef(format(new Date(), "M/d/y"))
  const today = todayRef.current
  const defaultPlaylistName = `${room?.title || "Radio Room"} ${today}`
  const [name, setName] = useState<string>(defaultPlaylistName)
  const hasInitialized = useRef(false)
  const [state, send] = useMachine(savePlaylistMachine, {
    actions: {
      notifyPlaylistCreated: (context) => {
        setIsEditing(false)
        toast({
          title: "Playlist created",
          description: context.playlistMeta?.url ? (
            <Text>
              <Link href={context.playlistMeta.url} target="_blank" textDecoration={"underline"}>
                {context.playlistMeta.title}
              </Link>{" "}
              was added to your collection
            </Text>
          ) : (
            <Text>{context.playlistMeta?.title} was created</Text>
          ),
          type: "success",
          duration: 4000,
        })
      },
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
  const isLoading = state.matches("loading")
  const canSave = isAdmin // Only room creator can save playlists

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

  const [selectedPlaylistState, selectedPlaylistSend] = useMachine(toggleableCollectionMachine, {
    context: {
      collection: currentPlaylist, // Start with all tracks selected by default
      persistent: false,
      name: "playlist-selected",
      idPath: "track.id", // Use track.id from QueueItem
    },
  })

  // Initialize selected playlist when drawer first opens or playlist loads
  useEffect(() => {
    if (isOpen && currentPlaylist.length > 0 && !hasInitialized.current) {
      selectedPlaylistSend("SET_ITEMS", { data: currentPlaylist })
      hasInitialized.current = true
    }
  }, [isOpen, currentPlaylist, selectedPlaylistSend])

  // Reset initialization flag when drawer closes
  useEffect(() => {
    if (!isOpen) {
      hasInitialized.current = false
    }
  }, [isOpen])

  const handleSelectionChange = (item: PlaylistItem) => {
    selectedPlaylistSend("TOGGLE_ITEM", {
      data: { ...item, id: item.track.id },
    })
  }
  const handleNameChange = (name: string) => setName(name)
  const handleFilterChange = (emoji: Emoji) => {
    filterSend("TOGGLE_ITEM", { data: emoji })
  }
  const handleTogglePlaylist = useCallback(() => playlistSend("TOGGLE_PLAYLIST"), [playlistSend])
  const handleSave = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const trackIds = selectedPlaylistState.context.collection.map((item) => item.track.id)

      send("SAVE_PLAYLIST", {
        name,
        trackIds,
      })
      return void 0
    },
    [send, selectedPlaylistState.context.collection, name, isAdmin],
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
      setIsEditing(false)
    }
  }, [isOpen])

  return (
    <Drawer
      open={isOpen}
      placement="start"
      heading="Playlist"
      onClose={handleTogglePlaylist}
      footer={
        canSave && (
          <DrawerPlaylistFooter
            isEditing={isEditing}
            onEdit={() => setIsEditing(!isEditing)}
            onSave={handleSave}
            onChange={handleNameChange}
            isLoading={isLoading}
            value={name}
            trackCount={selectedPlaylistState.context.collection.length}
          />
        )
      }
    >
      <VStack w="100%" h="100%" gap={4}>
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
                disabled={
                  currentPlaylist.length === selectedPlaylistState.context.collection.length
                }
              >
                Add {filteredPlaylistItems.length} Filtered
              </Button>
            )}
            <Button
              onClick={() => handleSelect("all")}
              size="sm"
              variant="ghost"
              disabled={currentPlaylist.length === selectedPlaylistState.context.collection.length}
            >
              Select All {currentPlaylist.length}
            </Button>
            <Button
              onClick={() => handleSelect("none")}
              size="sm"
              variant="ghost"
              disabled={selectedPlaylistState.context.collection.length === 0}
            >
              Deselect All
            </Button>
          </HStack>
        )}
        {isOpen && (
          <Box w="100%" h={["calc(100% - 22vh)", "100%"]}>
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

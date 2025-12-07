import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, Button, HStack, Text, Link, VStack } from "@chakra-ui/react"
import { format } from "date-fns"
import { useMachine } from "@xstate/react"
import { MetadataSourceType } from "@repo/types"

import Drawer from "../Drawer"
import DrawerPlaylistFooter from "./DrawerPlaylistFooter"
import PlaylistFilters from "../PlaylistFilters"
import usePlaylistFilter from "../usePlaylistFilter"

import { useSocketMachine } from "../../hooks/useSocketMachine"
import { savePlaylistMachine } from "../../machines/savePlaylistMachine"
import { createToggleableCollectionMachine } from "../../machines/toggleableCollectionMachine"
import { toast } from "../../lib/toasts"

import { Dictionary } from "../../types/Dictionary"
import { Reaction } from "../../types/Reaction"
import { PlaylistItem } from "../../types/PlaylistItem"
import { Emoji } from "../../types/Emoji"
import PlaylistWindow from "../PlaylistWindow"
import {
  useCurrentPlaylist,
  usePlaylistSend,
  usePlaylistActive,
  useIsAdmin,
  useCurrentRoom,
} from "../../hooks/useActors"

function DrawerPlaylist() {
  const playlistSend = usePlaylistSend()
  const currentPlaylist = useCurrentPlaylist()
  const isAdmin = useIsAdmin()
  const [isEditing, setIsEditing] = useState(false)
  const room = useCurrentRoom()
  const todayRef = useRef(format(new Date(), "M/d/y"))
  const today = todayRef.current
  const defaultPlaylistName = `${room?.title || "Radio Room"} ${today}`
  const [name, setName] = useState<string>(defaultPlaylistName)
  const hasInitialized = useRef(false)

  // Available services for playlist saving (from room's metadataSourceIds)
  const availableServices = useMemo(() => {
    const sources = room?.metadataSourceIds || ["spotify"]
    return sources as MetadataSourceType[]
  }, [room?.metadataSourceIds])

  // Target service for saving (defaults to first available)
  const [targetService, setTargetService] = useState<MetadataSourceType>(
    availableServices[0] || "spotify"
  )

  // Update targetService when availableServices change
  useEffect(() => {
    if (!availableServices.includes(targetService)) {
      setTargetService(availableServices[0] || "spotify")
    }
  }, [availableServices, targetService])

  // Create save playlist machine with custom notification action
  const customSavePlaylistMachine = useMemo(
    () =>
      savePlaylistMachine.provide({
        actions: {
          notifyPlaylistCreated: ({ context }) => {
            setIsEditing(false)
            toast({
              title: "Playlist created",
              description: context.playlistMeta?.url ? (
                <Text>
                  <Link
                    href={context.playlistMeta.url}
                    target="_blank"
                    textDecoration={"underline"}
                  >
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
      }),
    [],
  )
  const [state, send] = useSocketMachine(customSavePlaylistMachine)

  // Create filter machine with custom context
  const filterMachine = useMemo(
    () =>
      createToggleableCollectionMachine({
        collection: [],
        idPath: "shortcodes",
        name: "playlistFilters",
        persistent: false,
      }),
    [],
  )
  const [filterState, filterSend] = useMachine(filterMachine)
  const isOpen = usePlaylistActive()
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

  // Create selected playlist machine with custom context
  const selectedPlaylistMachine = useMemo(
    () =>
      createToggleableCollectionMachine({
        collection: [], // Will be populated via SET_ITEMS when drawer opens
        persistent: false,
        name: "playlist-selected",
        idPath: "track.id", // Use track.id from QueueItem
      }),
    [],
  )
  const [selectedPlaylistState, selectedPlaylistSend] = useMachine(selectedPlaylistMachine)

  // Initialize selected playlist when drawer first opens or playlist loads
  useEffect(() => {
    if (isOpen && currentPlaylist.length > 0 && !hasInitialized.current) {
      selectedPlaylistSend({ type: "SET_ITEMS", data: currentPlaylist })
      hasInitialized.current = true
    }
  }, [isOpen, currentPlaylist, selectedPlaylistSend])

  // Reset initialization flag when drawer closes
  useEffect(() => {
    if (!isOpen) {
      hasInitialized.current = false
    }
  }, [isOpen])

  // Auto-deselect unavailable tracks when target service changes
  useEffect(() => {
    if (!isEditing) return
    
    const currentCollection = selectedPlaylistState.context.collection
    const availableTracks = currentCollection.filter((item) => {
      // Check if track is available for target service
      const sourceData = item.metadataSources?.[targetService]
      if (sourceData?.source?.trackId) return true
      // Fallback for spotify media source
      if (targetService === "spotify" && item.mediaSource?.type === "spotify") return true
      return false
    })
    
    // Only update if we need to remove some tracks
    if (availableTracks.length < currentCollection.length) {
      selectedPlaylistSend({ type: "SET_ITEMS", data: availableTracks })
    }
  }, [targetService, isEditing, selectedPlaylistState.context.collection, selectedPlaylistSend])

  const handleSelectionChange = (item: PlaylistItem) => {
    selectedPlaylistSend({
      type: "TOGGLE_ITEM",
      data: { ...item, id: item.track.id },
    })
  }
  const handleNameChange = (name: string) => setName(name)
  const handleFilterChange = (emoji: Emoji) => {
    filterSend({ type: "TOGGLE_ITEM", data: emoji })
  }
  const handleTogglePlaylist = useCallback(
    () => playlistSend({ type: "TOGGLE_PLAYLIST" }),
    [playlistSend],
  )
  const handleSave = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      e.stopPropagation()

      send({
        type: "SAVE_PLAYLIST",
        name,
        items: selectedPlaylistState.context.collection,
        targetService,
        roomId: room?.id,
      })
      return void 0
    },
    [send, selectedPlaylistState.context.collection, name, targetService, room?.id],
  )
  const handleSelect = (selection: "all" | "none" | "filtered") => {
    switch (selection) {
      case "all":
        return selectedPlaylistSend({ type: "SET_ITEMS", data: currentPlaylist })
      case "none":
        return selectedPlaylistSend({ type: "CLEAR" })
      case "filtered":
        return selectedPlaylistSend({
          type: "ADD_ITEMS",
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
      size={["full", "lg"]}
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
            availableServices={availableServices}
            targetService={targetService}
            onServiceChange={setTargetService}
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
              targetService={isEditing ? targetService : undefined}
            />
          </Box>
        )}
      </VStack>
    </Drawer>
  )
}

export default DrawerPlaylist

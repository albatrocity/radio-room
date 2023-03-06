import { useMachine, useSelector } from "@xstate/react"
import React, { useCallback, useEffect } from "react"

import { toggleableCollectionMachine } from "../machines/toggleableCollectionMachine"
import { PlaylistItem } from "../types/PlaylistItem"
import Playlist from "./Playlist"
import useGlobalContext from "./useGlobalContext"

type Props = {
  isSelectable: boolean
  onChange: (collection: PlaylistItem[]) => void
}

function SelectablePlaylist({ isSelectable, onChange }: Props) {
  const globalServices = useGlobalContext()
  const playlist: PlaylistItem[] = useSelector(
    globalServices.roomService,
    (state) => state.context.playlist,
  )

  const [state, send] = useMachine(toggleableCollectionMachine, {
    context: {
      collection: playlist,
      persistent: false,
      name: "playlist-selected",
      idPath: "spotifyData.uri",
    },
  })

  const handleSelectItem = useCallback(
    (item: PlaylistItem) => {
      send("TOGGLE_ITEM", { data: { ...item, id: item.spotifyData?.uri } })
    },
    [send],
  )

  useEffect(() => {
    onChange(state.context.collection)
  }, [state.context.collection])

  return (
    <Playlist
      data={playlist}
      onSelect={handleSelectItem}
      selectable={isSelectable}
      selected={state.context.collection}
    />
  )
}

export default SelectablePlaylist

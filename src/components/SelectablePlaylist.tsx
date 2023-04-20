import { useMachine } from "@xstate/react"
import React, { useCallback, useEffect } from "react"

import { toggleableCollectionMachine } from "../machines/toggleableCollectionMachine"
import { PlaylistItem } from "../types/PlaylistItem"
import Playlist from "./Playlist"
import { useCurrentPlaylist } from "../state/playlistStore"

type Props = {
  isSelectable: boolean
  onChange: (collection: PlaylistItem[]) => void
}

function SelectablePlaylist({ isSelectable, onChange }: Props) {
  const playlist = useCurrentPlaylist()

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

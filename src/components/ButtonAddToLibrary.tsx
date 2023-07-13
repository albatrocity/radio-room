import React, { useEffect } from "react"
import { useMachine } from "@xstate/react"
import { IconButton } from "@chakra-ui/react"
import { FaRegHeart, FaHeart } from "react-icons/fa"

import {
  useIsSpotifyAuthenticated,
  useSpotifyAccessToken,
} from "../state/spotifyAuthStore"
import spotifyAddToLibraryMachine from "../machines/spotifyAddToLibraryMachine"

interface Props {
  id?: string
}

export default function ButtonAddToLibrary({ id }: Props) {
  const isAuthed = useIsSpotifyAuthenticated()
  const accessToken = useSpotifyAccessToken()

  useEffect(() => {
    if (id) {
      send("SET_IDS", { data: [id] })
    }
  }, [id])

  const [state, send] = useMachine(spotifyAddToLibraryMachine, {
    context: {
      ids: id ? [id] : undefined,
      accessToken,
    },
  })
  if (!isAuthed || !id) {
    return null
  }

  const isAdded = state.context.tracks[id]

  return (
    <IconButton
      icon={isAdded ? <FaHeart /> : <FaRegHeart />}
      aria-label={
        isAdded ? "Remove from Spotify Library" : "Add to Spotify library"
      }
      size="sm"
      variant="darkGhost"
      isLoading={state.matches("loading")}
      isDisabled={state.matches("loading")}
      onClick={() => {
        isAdded ? send("REMOVE", { data: [id] }) : send("ADD", { data: [id] })
      }}
    />
  )
}

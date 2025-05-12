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

  const [state, send] = useMachine(spotifyAddToLibraryMachine, {
    context: {
      ids: id ? [id] : undefined,
      accessToken,
    },
  })

  const isAdded = id ? state.context.tracks[id] : false

  useEffect(() => {
    if (id) {
      send("SET_IDS", { data: [id] })
    }
  }, [id])

  useEffect(() => {
    if (accessToken) {
      send("SET_ACCESS_TOKEN", { data: accessToken })
    }
  }, [accessToken])

  if (!isAuthed || !id) {
    return null
  }

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

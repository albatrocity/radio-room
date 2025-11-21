import React, { useEffect } from "react"
import { useMachine } from "@xstate/react"
import { IconButton } from "@chakra-ui/react"
import { FaRegHeart, FaHeart } from "react-icons/fa"

import { useIsAdmin } from "../state/authStore"
import addToLibraryMachine from "../machines/spotifyAddToLibraryMachine"

interface Props {
  id?: string
}

export default function ButtonAddToLibrary({ id }: Props) {
  const isAdmin = useIsAdmin()

  const [state, send] = useMachine(addToLibraryMachine, {
    context: {
      ids: id ? [id] : undefined,
    },
  })

  const isAdded = id ? state.context.tracks[id] : false

  useEffect(() => {
    if (id) {
      send("SET_IDS", { data: [id] })
    }
  }, [id])

  // Only show button to room creators (admin)
  if (!isAdmin || !id) {
    return null
  }

  return (
    <IconButton
      icon={isAdded ? <FaHeart /> : <FaRegHeart />}
      aria-label={isAdded ? "Remove from library" : "Add to library"}
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

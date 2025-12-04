import { useEffect } from "react"
import { useMachine } from "@xstate/react"
import { IconButton } from "@chakra-ui/react"
import { FaRegHeart, FaHeart } from "react-icons/fa"

import { useIsAdmin } from "../state/authStore"
import addToLibraryMachine from "../machines/addToLibraryMachine"

interface Props {
  readonly id?: string
}

export default function ButtonAddToLibrary({ id }: Props) {
  const isAdmin = useIsAdmin()
  const [state, send] = useMachine(addToLibraryMachine)

  const isAdded = id ? state.context.tracks[id] : false

  useEffect(() => {
    if (id) {
      send("SET_IDS", { data: [id] })
    }
  }, [id])

  // Only show button to room creators (admin)
  // Server will handle routing to correct metadata source based on room config
  if (!isAdmin || !id) {
    return null
  }

  return (
    <IconButton
      aria-label={isAdded ? "Remove from library" : "Add to library"}
      size="xs"
      variant="bright"
      colorPalette="action"
      loading={state.matches("loading")}
      disabled={state.matches("loading")}
      onClick={() => {
        isAdded ? send("REMOVE", { data: [id] }) : send("ADD", { data: [id] })
      }}
    >
      {isAdded ? <FaHeart /> : <FaRegHeart />}
    </IconButton>
  )
}

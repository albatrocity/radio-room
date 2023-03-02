import React from "react"
import { useHotkeys } from "react-hotkeys-hook"
import useCanDj from "./useCanDj"
import useGlobalContext from "./useGlobalContext"

type Props = {}

function KeyboardShortcuts({}: Props) {
  const globalServices = useGlobalContext()
  const canDj = useCanDj()
  useHotkeys("ctrl+a", () => {
    if (canDj) {
      globalServices.roomService.send("EDIT_QUEUE")
    }
  })

  return null
}

export default KeyboardShortcuts

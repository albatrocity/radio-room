import { useHotkeys } from "react-hotkeys-hook"
import useCanDj from "./useCanDj"
import { useModalsSend } from "../hooks/useActors"

type Props = {}

function KeyboardShortcuts({}: Props) {
  const modalSend = useModalsSend()
  const canDj = useCanDj()
  useHotkeys("ctrl+a", () => {
    if (canDj) {
      modalSend({ type: "EDIT_QUEUE" })
    }
  })

  return null
}

export default KeyboardShortcuts

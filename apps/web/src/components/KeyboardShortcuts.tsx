import { useHotkeys } from "react-hotkeys-hook"
import useCanDj from "./useCanDj"
import { useModalsStore } from "../state/modalsState"

type Props = {}

function KeyboardShortcuts({}: Props) {
  const { send } = useModalsStore()
  const canDj = useCanDj()
  useHotkeys("ctrl+a", () => {
    if (canDj) {
      send("EDIT_QUEUE")
    }
  })

  return null
}

export default KeyboardShortcuts

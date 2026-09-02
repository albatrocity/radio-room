import { Button, Icon, Status, type ButtonProps } from "@chakra-ui/react"
import { LuMessageSquareHeart } from "react-icons/lu"
import { useModalsSend, useSurfaceHasNotifications } from "../hooks/useActors"

type Props = {
  variant?: ButtonProps["variant"]
  colorPalette?: ButtonProps["colorPalette"]
  w?: ButtonProps["w"]
  /** Called before opening feedback (e.g. close Preferences / Help). */
  beforeOpen?: () => void
  label?: string
}

/** Opens the listener Feedback modal. */
function ButtonFeedback({
  variant = "outline",
  colorPalette = "action",
  w,
  beforeOpen,
  label = "Feedback",
}: Props) {
  const modalSend = useModalsSend()
  const hasFeedbackAttention = useSurfaceHasNotifications("feedback")

  const openFeedback = () => {
    beforeOpen?.()
    modalSend({ type: "VIEW_FEEDBACK" })
  }

  return (
    <Button variant={variant} w={w} colorPalette={colorPalette} onClick={openFeedback}>
      <Icon as={LuMessageSquareHeart} />
      {label}
      {hasFeedbackAttention ? (
        <Status.Root size="sm" colorPalette="primary">
          <Status.Indicator />
        </Status.Root>
      ) : null}
    </Button>
  )
}

export default ButtonFeedback

import { IconButton, type IconButtonProps } from "@chakra-ui/react"
import { LuPencil } from "react-icons/lu"
import { useModalsSend } from "../hooks/useActors"

type Props = {
  size?: IconButtonProps["size"]
  variant?: IconButtonProps["variant"]
  /** Defaults to opening the edit-username modal. */
  onClick?: () => void
}

/** Pencil control that opens the username editor (same as the listeners list). */
function ButtonEditUsername({ size = "xs", variant = "plain", onClick }: Props) {
  const modalSend = useModalsSend()
  const handleClick = onClick ?? (() => modalSend({ type: "EDIT_USERNAME" }))

  return (
    <IconButton
      variant={variant}
      aria-label="Edit Username"
      onClick={handleClick}
      size={size}
    >
      <LuPencil />
    </IconButton>
  )
}

export default ButtonEditUsername

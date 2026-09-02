import { Icon, IconButton, type IconButtonProps } from "@chakra-ui/react"
import { LuListMusic } from "react-icons/lu"
import { usePlaylistSend } from "../hooks/useActors"

type Props = {
  variant?: IconButtonProps["variant"]
  size?: IconButtonProps["size"]
  colorPalette?: IconButtonProps["colorPalette"]
  /** Defaults to toggling the playlist drawer. */
  onClick?: () => void
}

/** Opens the playlist drawer — same control as the player strip. */
function ButtonPlaylist({
  variant = "ghost",
  size = "md",
  colorPalette,
  onClick,
}: Props) {
  const playlistSend = usePlaylistSend()
  const handleClick = onClick ?? (() => playlistSend({ type: "TOGGLE_PLAYLIST" }))

  return (
    <IconButton
      size={size}
      aria-label="Playlist"
      variant={variant}
      colorPalette={colorPalette}
      onClick={handleClick}
    >
      <Icon boxSize={5} as={LuListMusic} />
    </IconButton>
  )
}

export default ButtonPlaylist

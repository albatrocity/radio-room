import { memo, useRef } from "react"
import { Box, IconButton } from "@chakra-ui/react"
import PlayStateIcon from "./PlayStateIcon"
import { useAnimeScope } from "../animations/useAnimeScope"
import { usePlayPauseAttentionAnimation } from "../animations/usePlayPauseAttentionAnimation"
import { useAnimationsEnabled } from "../hooks/useReducedMotion"

type Props = {
  playing: boolean
  loading: boolean
  onClick: () => void
}

function PlayPauseButton({ playing, loading, onClick }: Props) {
  const animationsEnabled = useAnimationsEnabled()
  const shouldAnimate = !playing && animationsEnabled

  const scopeRootRef = useRef<HTMLDivElement>(null)
  const buttonMotionRef = useRef<HTMLDivElement>(null)

  useAnimeScope(scopeRootRef, shouldAnimate)
  usePlayPauseAttentionAnimation(shouldAnimate, buttonMotionRef)

  return (
    <Box ref={scopeRootRef} display="inline-flex">
      <Box ref={buttonMotionRef} display="inline-flex" style={{ transformOrigin: "center" }}>
        <IconButton
          size="md"
          aria-label={playing ? "Stop" : "Play"}
          variant="ghost"
          onClick={onClick}
        >
          <PlayStateIcon loading={loading} playing={playing} />
        </IconButton>
      </Box>
    </Box>
  )
}

export default memo(PlayPauseButton)

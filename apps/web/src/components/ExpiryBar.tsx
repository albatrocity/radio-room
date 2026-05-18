import { memo } from "react"
import { Box } from "@chakra-ui/react"
import { ClassNames, keyframes } from "@emotion/react"

export type ExpiryBarOrientation = "horizontal" | "vertical"

const expiryBarDrainHorizontal = keyframes`
  from { width: 100%; }
  to { width: 0%; }
`

const expiryBarDrainVertical = keyframes`
  from { height: 100%; }
  to { height: 0%; }
`

/** Chakra palette token (e.g. `gray.500`) → CSS variable for use in Emotion styles. */
function chakraColorVar(token: string): string {
  return `var(--chakra-colors-${token.replace(".", "-")})`
}

export interface ExpiryBarProps {
  /** Epoch ms when the timed window started. */
  startAt: number
  /** Epoch ms when the timed window ends. */
  endAt: number
  /** Chakra color token for the fill (e.g. `gray.500`, `red.500`). */
  color: string
  /**
   * `horizontal`: fill drains toward the trailing edge (width shrinks).
   * `vertical`: fill drains downward (height shrinks from top).
   */
  orientation?: ExpiryBarOrientation
  /** Flex grow/shrink for slot layouts (e.g. UserEffectBars). */
  flex?: string
  /** Explicit outer height (e.g. `3px` for chat message previews). */
  height?: string
  /** Explicit outer width; defaults to 100% when height is set. */
  width?: string
}

/**
 * Draining progress bar for a fixed time window. Uses a single CSS keyframe
 * animation (60fps) with negative delay to fast-forward when mounted mid-window.
 *
 * Fill animation uses Emotion `className` via `ClassNames` (see AnimatedShopQty).
 * Chakra v3's `css` prop must not receive Emotion SerializedStyles.
 */
export const ExpiryBar = memo(function ExpiryBar({
  startAt,
  endAt,
  color,
  orientation = "horizontal",
  flex,
  height,
  width,
}: ExpiryBarProps) {
  const duration = Math.max(0, endAt - startAt)
  const elapsed =
    duration <= 0 ? 0 : Math.max(0, Math.min(duration, Date.now() - startAt))
  const drainKeyframes =
    orientation === "vertical" ? expiryBarDrainVertical : expiryBarDrainHorizontal
  const fillColor = chakraColorVar(color)

  const slotWidth =
    flex != null && orientation === "horizontal" ? "100%" : undefined
  const slotMinH = flex != null && orientation === "horizontal" ? 0 : undefined
  const slotHeight =
    flex != null && orientation === "vertical" ? "100%" : undefined
  const slotMinW = flex != null && orientation === "vertical" ? 0 : undefined

  return (
    <Box
      position="relative"
      flex={flex}
      width={width ?? (height != null ? "100%" : slotWidth)}
      height={height ?? slotHeight}
      minHeight={slotMinH}
      minWidth={slotMinW}
      overflow="hidden"
      data-orientation={orientation}
      aria-hidden
    >
      {duration > 0 && (
        <ClassNames>
          {({ css: emotionCss }) =>
            orientation === "vertical" ? (
              <span
                className={emotionCss`
                  position: absolute;
                  bottom: 0;
                  left: 0;
                  right: 0;
                  height: 100%;
                  background-color: ${fillColor};
                  animation: ${drainKeyframes} ${duration}ms linear -${elapsed}ms forwards;
                `}
              />
            ) : (
              <span
                className={emotionCss`
                  position: absolute;
                  bottom: 0;
                  left: 0;
                  top: 0;
                  width: 100%;
                  background-color: ${fillColor};
                  animation: ${drainKeyframes} ${duration}ms linear -${elapsed}ms forwards;
                `}
              />
            )
          }
        </ClassNames>
      )}
    </Box>
  )
})

export default ExpiryBar

import { memo, useMemo, type CSSProperties } from "react"
import { Badge, Box } from "@chakra-ui/react"
import type { GameStateModifier, ItemDefinition } from "@repo/types"
import { useNow, useUserItemDefinitions, useUserModifiers, useUserState } from "../hooks/useActors"
import { Tooltip } from "./ui/tooltip"
import { UserModifiersList } from "./UserModifiersList"

const MAX_BARS = 4

type Intent = "positive" | "negative" | "neutral"

type EffectBarSpec = {
  key: string
  intent: Intent
  startAt: number
  endAt: number
}

function intentColor(intent: Intent): string {
  if (intent === "positive") return "green.500"
  if (intent === "negative") return "red.500"
  return "gray.500"
}

/** Shared flex slot sizing for vertical vs horizontal bar layout (data-attribute styling). */
const orientationSlotCss = {
  '&[data-orientation="horizontal"]': { width: "100%", minH: 0 },
  '&[data-orientation="vertical"]': { height: "100%", minW: 0 },
}

/** Fill layer: dimension driven by `--effect-fill` (0–1), orientation selects axis + transition. */
const effectBarFillCss = {
  position: "absolute" as const,
  bottom: 0,
  left: 0,
  '&[data-orientation="horizontal"]': {
    top: 0,
    width: "calc(var(--effect-fill) * 100%)",
    transition: "width 1s linear",
  },
  '&[data-orientation="vertical"]': {
    right: 0,
    height: "calc(var(--effect-fill) * 100%)",
    transition: "height 1s linear",
  },
  transition: "width 0.3s linear, height 0.3s linear",
}

export type UserEffectBarsOrientation = "vertical" | "horizontal"

interface UserEffectBarsProps {
  /**
   * Optional user id. When provided, displays that user's effects via the
   * room-wide `roomGameStateActor`. When omitted, falls back to the current
   * user's state via `userGameStateActor`.
   */
  userId?: string
  /**
   * `vertical` (default): up to four narrow columns in a row; remaining time
   * drains downward (fill grows from the bottom).
   * `horizontal`: up to four stacked rows; remaining time drains toward the
   * trailing edge (fill grows from the left).
   */
  orientation?: UserEffectBarsOrientation
  tooltip?: boolean
  overflowBadge?: boolean
}

/**
 * Renders up to 4 drain-down bars representing a user's active
 * intent-bearing game effects. Each bar's height is the fraction of its
 * parent modifier's duration remaining; color is derived from the effect's
 * `intent`. When more than 4 effects are active, a `+N` badge is overlaid
 * in the top-right corner.
 *
 * Driven by socket-pushed events (no polling). All bars in the app share a
 * single 1Hz `sharedTickerActor` for animation, so cost is constant in the
 * number of mounted bars.
 *
 * Scales to its parent container in both axes; place inside a sized box.
 */
export function UserEffectBars({
  userId,
  orientation = "vertical",
  tooltip = false,
  overflowBadge = false,
}: UserEffectBarsProps) {
  const selfState = useUserState()
  const definitions = useUserItemDefinitions()
  const otherModifiers = useUserModifiers(userId)
  const modifiers: GameStateModifier[] | undefined = userId
    ? otherModifiers
    : selfState?.modifiers ?? undefined

  const definitionMap = useMemo(() => {
    const map = new Map<string, ItemDefinition>()
    for (const def of definitions ?? []) {
      map.set(def.id, def)
    }
    return map
  }, [definitions])

  const bars = useMemo<EffectBarSpec[]>(() => {
    if (!modifiers || modifiers.length === 0) return []
    const now = Date.now()
    const list: EffectBarSpec[] = []
    for (const m of modifiers) {
      if (m.startAt > now || m.endAt <= now || m.endAt <= m.startAt) continue
      m.effects.forEach((effect, i) => {
        if (effect.intent) {
          list.push({
            key: `${m.id}:${i}`,
            intent: effect.intent,
            startAt: m.startAt,
            endAt: m.endAt,
          })
        }
      })
    }
    return list
  }, [modifiers])

  if (bars.length === 0) return null

  const visible = bars.slice(0, MAX_BARS)
  const overflow = overflowBadge ? bars.length - visible.length : 0

  const isHorizontal = orientation === "horizontal"

  return (
    <Tooltip
      content={
        tooltip ? (
          <UserModifiersList definitionMap={definitionMap} modifiers={modifiers ?? []} />
        ) : null
      }
    >
      <Box
        position="relative"
        width="100%"
        height="100%"
        display="flex"
        flexDirection={isHorizontal ? "column" : "row"}
        gap={"1px"}
      >
        {Array.from({ length: MAX_BARS }).map((_, i) => {
          const bar = visible[i]
          if (bar) {
            const { key, ...barProps } = bar
            return <EffectBar key={key} orientation={orientation} slotIndex={i} {...barProps} />
          }
          return <EmptySlot key={`empty-${i}`} orientation={orientation} slotIndex={i} />
        })}
        {overflow > 0 ? (
          <Badge
            position="absolute"
            top={0}
            right={0}
            colorPalette="gray"
            variant="solid"
            fontSize="2xs"
            px={1}
            pointerEvents="none"
            lineHeight="1"
          >
            {`+${overflow}`}
          </Badge>
        ) : null}
      </Box>
    </Tooltip>
  )
}

function EmptySlot({
  orientation,
  slotIndex: _slotIndex,
}: {
  orientation: UserEffectBarsOrientation
  slotIndex: number
}) {
  return <Box flex="1 1 0" aria-hidden data-orientation={orientation} css={orientationSlotCss} />
}

interface EffectBarProps {
  orientation: UserEffectBarsOrientation
  slotIndex: number
  startAt: number
  endAt: number
  intent: Intent
}

const EffectBar = memo(function EffectBar({
  orientation,
  slotIndex: _slotIndex,
  startAt,
  endAt,
  intent,
}: EffectBarProps) {
  const now = useNow()
  const duration = endAt - startAt
  const fraction = duration <= 0 ? 0 : Math.max(0, Math.min(1, (endAt - now) / duration))

  return (
    <Box
      position="relative"
      flex="1 1 0"
      overflow="hidden"
      data-orientation={orientation}
      css={orientationSlotCss}
    >
      <Box
        bg={intentColor(intent)}
        data-orientation={orientation}
        style={
          {
            "--effect-fill": String(fraction),
          } as CSSProperties
        }
        css={effectBarFillCss}
      />
    </Box>
  )
})

export default UserEffectBars

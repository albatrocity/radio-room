import { useMemo } from "react"
import { Badge, Box } from "@chakra-ui/react"
import type { GameStateModifier, ItemDefinition } from "@repo/types"
import {
  useCurrentUser,
  useUserItemDefinitions,
  useUserModifiers,
  useUserState,
} from "../hooks/useActors"
import { ExpiryBar, type ExpiryBarOrientation } from "./ExpiryBar"
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

export type UserEffectBarsOrientation = ExpiryBarOrientation

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
  const currentUser = useCurrentUser()
  const definitions = useUserItemDefinitions()
  const otherModifiers = useUserModifiers(userId)
  const modifiers: GameStateModifier[] | undefined = userId
    ? otherModifiers
    : selfState?.modifiers ?? undefined

  /** Hide `visibility: "self"` modifiers when rendering another user's row (not your own). */
  const isViewingOtherUser =
    userId != null && userId !== currentUser?.userId
  const modifiersForUi = useMemo(() => {
    if (!modifiers || modifiers.length === 0) return modifiers
    if (!isViewingOtherUser) return modifiers
    return modifiers.filter((m) => m.visibility !== "self")
  }, [modifiers, isViewingOtherUser])

  const definitionMap = useMemo(() => {
    const map = new Map<string, ItemDefinition>()
    for (const def of definitions ?? []) {
      map.set(def.id, def)
    }
    return map
  }, [definitions])

  const bars = useMemo<EffectBarSpec[]>(() => {
    if (!modifiersForUi || modifiersForUi.length === 0) return []
    const now = Date.now()
    const list: EffectBarSpec[] = []
    for (const m of modifiersForUi) {
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
  }, [modifiersForUi])

  if (bars.length === 0) return null

  const visible = bars.slice(0, MAX_BARS)
  const overflow = overflowBadge ? bars.length - visible.length : 0

  const isHorizontal = orientation === "horizontal"

  return (
    <Tooltip
      content={
        tooltip ? (
          <UserModifiersList definitionMap={definitionMap} modifiers={modifiersForUi ?? []} />
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
            const { key, intent, startAt, endAt } = bar
            return (
              <ExpiryBar
                key={key}
                flex="1 1 0"
                startAt={startAt}
                endAt={endAt}
                color={intentColor(intent)}
                orientation={orientation}
              />
            )
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
  const isHorizontal = orientation === "horizontal"
  return (
    <Box
      flex="1 1 0"
      aria-hidden
      data-orientation={orientation}
      width={isHorizontal ? "100%" : undefined}
      minHeight={isHorizontal ? "0" : undefined}
      height={!isHorizontal ? "100%" : undefined}
      minWidth={!isHorizontal ? "0" : undefined}
    />
  )
}

export default UserEffectBars

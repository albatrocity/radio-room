import { Text } from "@chakra-ui/react"
import { useMachine } from "@xstate/react"
import { useMemo } from "react"
import { createTimerMachine } from "../../../machines/TimerMachine"
import { usePluginComponentContext } from "../context"
import type { CountdownComponentProps } from "../../../types/PluginComponent"

/**
 * Countdown component - shows a countdown timer with optional text.
 * Pulls start time from plugin store and manages timer state.
 */
export function CountdownTemplateComponent({ startKey, duration }: CountdownComponentProps) {
  const { store, config, textColor } = usePluginComponentContext()

  // Get start timestamp from store
  const startValue = store[startKey]

  // Don't render if no valid start time
  if (startValue === null || startValue === undefined) {
    return null
  }

  const start =
    typeof startValue === "number"
      ? startValue
      : typeof startValue === "string"
      ? new Date(startValue).getTime()
      : Date.now()

  // Resolve duration - can be:
  // 1. A number literal
  // 2. A config path like "config.timeLimit"
  // 3. A store key like "perTrackWindowMs"
  let resolvedDuration = 0
  if (typeof duration === "number") {
    resolvedDuration = duration
  } else if (typeof duration === "string") {
    if (duration.startsWith("config.")) {
      const configKey = duration.substring(7)
      const configValue = config[configKey]
      resolvedDuration = typeof configValue === "number" ? configValue : 0
    } else {
      // Bare string: look up in store
      const storeValue = store[duration]
      resolvedDuration = typeof storeValue === "number" ? storeValue : 0
    }
  }

  // Key by both start and duration to force remount when track or budget changes
  return (
    <CountdownTimerDisplay
      key={`${start}-${resolvedDuration}`}
      start={start}
      duration={resolvedDuration}
      textColor={textColor}
    />
  )
}

/**
 * Internal component that renders the actual countdown.
 * Separated so we can key it by start time for proper remounting.
 */
function CountdownTimerDisplay({
  start,
  duration,
  textColor,
}: {
  start: number
  duration: number
  textColor?: string
}) {
  const machine = useMemo(() => createTimerMachine({ start, duration }), [start, duration])
  const [state] = useMachine(machine)

  const isExpired = state.matches("expired")
  const remaining = Math.round(state.context.remaining / 1000)

  return (
    <Text as="span" fontSize="sm" fontWeight="bold" color={textColor}>
      {isExpired ? 0 : remaining}
    </Text>
  )
}

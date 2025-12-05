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

  // Resolve duration - can be a number or a config path like "config.timeLimit"
  let resolvedDuration = typeof duration === "number" ? duration : 0
  if (typeof duration === "string" && duration.startsWith("config.")) {
    const configKey = duration.substring(7)
    const configValue = config[configKey]
    resolvedDuration = typeof configValue === "number" ? configValue : 0
  }

  // Use start time as key to force remount when track changes
  return (
    <CountdownTimerDisplay
      key={start}
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

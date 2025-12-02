import React from "react"
import { HStack, Text, VStack } from "@chakra-ui/react"
import { useMachine } from "@xstate/react"
import { interpolateTemplate, interpolateCompositeTemplate } from "@repo/utils"
import { createTimerMachine } from "../../../machines/TimerMachine"
import { usePluginComponentContext } from "../context"
import { renderTemplateComponent } from "./componentMap"
import type { CountdownComponentProps, CompositeTemplate } from "../../../types/PluginComponent"

/**
 * Countdown component - shows a countdown timer with optional text.
 * Pulls start time from plugin store and manages timer state.
 */
export function CountdownTemplateComponent({ startKey, duration }: CountdownComponentProps) {
  const { store, config } = usePluginComponentContext()

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
    <CountdownTimerDisplay key={start} start={start} duration={resolvedDuration} config={config} />
  )
}

/**
 * Internal component that renders the actual countdown.
 * Separated so we can key it by start time for proper remounting.
 */
function CountdownTimerDisplay({
  start,
  duration,
}: {
  start: number
  duration: number
  config: Record<string, unknown>
}) {
  const [state] = useMachine(createTimerMachine({ start, duration }))

  const isExpired = state.matches("expired")
  const remaining = Math.round(state.context.remaining / 1000)

  return (
    <Text as="span" fontSize="sm" fontWeight="bold">
      {isExpired ? 0 : remaining}
    </Text>
  )
}

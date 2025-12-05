import { Text, TextProps } from "@chakra-ui/react"
import { createTimerMachine } from "../machines/TimerMachine"
import { useMachine } from "@xstate/react"
import { createContext, useMemo } from "react"

type CountdownTimerProps = {
  start?: number
  duration: number
} & TextProps

export function CountdownTimer({
  start = Date.now(),
  duration = 60000,
  ...props
}: Readonly<CountdownTimerProps>) {
  const machine = useMemo(() => createTimerMachine({ start, duration }), [start, duration])
  const [state] = useMachine(machine)

  return (
    <Text {...props}>
      {state.matches("expired") ? 0 : Math.round(state.context.remaining / 1000)}
    </Text>
  )
}

type ICountdownTimerContext = {
  remaining: number
  isExpired: boolean
}

export const CountdownTimerContext = createContext<ICountdownTimerContext>({
  remaining: 0,
  isExpired: false,
})

export const CountdownTimerProvider = ({
  children,
  start,
  duration,
}: {
  children: React.ReactNode
  start: number
  duration: number
}) => {
  const machine = useMemo(() => createTimerMachine({ start, duration }), [start, duration])
  const [state] = useMachine(machine)

  const value = useMemo(() => {
    return {
      remaining: state.context.remaining,
      isExpired: state.matches("expired"),
    }
  }, [state])

  return <CountdownTimerContext.Provider value={value}>{children}</CountdownTimerContext.Provider>
}

/**
 * useSocketMachine
 *
 * A hook that wraps useMachine and subscribes the machine to socket events.
 * Use this for component-local machines that need to receive socket events.
 *
 * WHY THIS EXISTS:
 * The XState invoke pattern doesn't work reliably with React StrictMode because:
 * 1. StrictMode causes rapid mount/unmount cycles
 * 2. When unmount happens, XState stops the interpreter, invalidating the callback
 * 3. By the time socket events arrive, the invoke callback is no longer valid
 *
 * This hook works because it subscribes the interpreter reference directly,
 * which remains valid as long as the component is mounted.
 *
 * For framework-agnostic code, module-level actors (singletons) can still use
 * subscribeActor() directly since they don't have React lifecycle issues.
 */

import { useEffect } from "react"
import { useMachine } from "@xstate/react"
import { AnyStateMachine } from "xstate"
import { subscribeActor, unsubscribeActor } from "../actors/socketActor"

/**
 * Like useMachine, but also subscribes the machine to socket events.
 *
 * The machine receives socket events as { type: eventType, data }. Without
 * `eventTypes` it receives every SERVER_EVENT and ignores the ones it does not
 * handle; pass an allowlist so the hub skips the rest (ADR 0093).
 *
 * @param machine - The XState machine to use
 * @param options - useMachine options (actions, guards, etc.)
 * @param eventTypes - Optional allowlist of SERVER_EVENT types
 */
export function useSocketMachine<TMachine extends AnyStateMachine>(
  machine: TMachine,
  options?: Parameters<typeof useMachine<TMachine>>[1],
  eventTypes?: string[],
): ReturnType<typeof useMachine<TMachine>> {
  const result = useMachine(machine, options)
  // In XState v5, useMachine returns [state, send, actorRef]
  const actorRef = result[2]
  const allowlistKey = eventTypes?.join(",")

  useEffect(() => {
    // Subscribe the machine's actorRef to socket events
    subscribeActor(actorRef, allowlistKey ? allowlistKey.split(",") : undefined)

    return () => {
      unsubscribeActor(actorRef)
    }
  }, [actorRef, allowlistKey])

  return result
}

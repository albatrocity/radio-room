/**
 * Socket Callback for XState Invoke
 *
 * NOTE: This is primarily used for plugin component machines, NOT for
 * component-local machines used with useMachine().
 *
 * For component-local machines (like addToLibraryMachine), use the
 * useSocketMachine hook instead. The invoke pattern doesn't work well
 * with React StrictMode because the callback becomes invalid when the
 * interpreter stops during unmount.
 *
 * Plugin machines work because they use unique IDs per instance and
 * are managed differently.
 */

import { InvokeCallback, AnyEventObject } from "xstate"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

/**
 * Creates a socket callback service for a specific machine ID.
 *
 * @param machineId - Stable identifier for this machine
 */
export function createSocketCallback(machineId: string): InvokeCallback<any, AnyEventObject> {
  return (callback) => {
    // Create subscriber that forwards events to the machine
    const subscriber = {
      send: (event: { type: string; data?: any }) => {
        // Use queueMicrotask to avoid synchronous dispatch issues
        queueMicrotask(() => {
          try {
            callback(event)
          } catch (err) {
            // Callback may be invalid if machine was stopped
          }
        })
      },
    }

    // Subscribe using stable machine ID
    subscribeById(machineId, subscriber)

    // Cleanup
    return () => {
      unsubscribeById(machineId)
    }
  }
}


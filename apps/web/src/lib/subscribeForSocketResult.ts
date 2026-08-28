import { useCallback, useEffect, useRef } from "react"
import { subscribeById, unsubscribeById } from "../actors/socketActor"
import { toaster } from "../components/ui/toaster"

export const SOCKET_RESULT_TIMEOUT_MS = 10_000

export type SocketResultEvent = {
  type: string
  data?: unknown
}

export type SubscribeForSocketResultOptions<TData = unknown> = {
  id: string
  eventType: string | string[]
  /** Called once a matching event with data arrives. The subscription is already torn down. */
  onResult: (data: TData) => void
  /** Default 10s. Pass `0` to wait until result or cancel. */
  timeoutMs?: number
  onTimeout?: () => void
  /** Default true when `timeoutMs > 0`. */
  toastTimeout?: boolean
}

/**
 * One-shot socket ack: subscribe with an eventTypes allowlist, settle on the first
 * matching payload (or timeout), then unsubscribe. Returns a cancel function.
 */
export function subscribeForSocketResult<TData = unknown>(
  options: SubscribeForSocketResultOptions<TData>,
): () => void {
  const {
    id,
    eventType,
    onResult,
    timeoutMs = SOCKET_RESULT_TIMEOUT_MS,
    onTimeout,
    toastTimeout = timeoutMs > 0,
  } = options
  const eventTypes = Array.isArray(eventType) ? eventType : [eventType]
  let settled = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const finish = () => {
    if (settled) return
    settled = true
    if (timeoutId != null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    unsubscribeById(id)
  }

  subscribeById(id, {
    send: (event: SocketResultEvent) => {
      if (settled) return
      if (!eventTypes.includes(event.type) || event.data == null) return
      finish()
      onResult(event.data as TData)
    },
    eventTypes,
  })

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      if (settled) return
      finish()
      onTimeout?.()
      if (toastTimeout) {
        toaster.create({
          title: "Timeout",
          description: "Action timed out",
          type: "error",
        })
      }
    }, timeoutMs)
  }

  return finish
}

/** Tracks the in-flight one-shot sub and cancels it on unmount or a new start. */
export function useSocketResultHandle() {
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      cancelRef.current?.()
      cancelRef.current = null
    }
  }, [])

  const track = useCallback((cancel: () => void) => {
    cancelRef.current?.()
    cancelRef.current = cancel
  }, [])

  const subscribe = useCallback(
    <TData = unknown>(options: SubscribeForSocketResultOptions<TData>) => {
      track(subscribeForSocketResult(options))
    },
    [track],
  )

  return { subscribe, track }
}

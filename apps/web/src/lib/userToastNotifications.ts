/**
 * Client handler for PluginAPI.sendUserToast (ADR 0148).
 * Toast-only: no indicator record, no persistence (ADR 0144 target: null).
 */

import { raiseNotification } from "../actors/notificationsActor"
import { subscribeById } from "../actors/socketActor"

export type UserToastPayload = {
  roomId?: string
  title: string
  description?: string
  type?: "info" | "success" | "warning" | "error"
  duration?: number
  id?: string
  source?: string
}

let subscribed = false

export function bindUserToastSocket(): void {
  if (subscribed) return
  subscribed = true
  subscribeById("user-toast", {
    eventTypes: ["USER_TOAST"],
    send: (event: { type?: string; data?: UserToastPayload }) => {
      if (event.type !== "USER_TOAST" || !event.data?.title) return
      const data = event.data
      raiseNotification({
        id: data.id ?? `user-toast-${Date.now()}`,
        source: data.source ?? "system",
        target: null,
        clearOn: "resolve",
        toast: {
          title: data.title,
          description: data.description,
          type: data.type ?? "info",
          duration: data.duration ?? 6000,
        },
      })
    },
  })
}

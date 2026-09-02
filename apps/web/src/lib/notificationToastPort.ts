/**
 * Toast side-effect port for the notifications machine.
 * Wrap toaster so unit tests can vi.mock this module without a DOM.
 */

import { toaster } from "../components/ui/toaster"
import { navigateToTarget } from "./navigateToNotificationTarget"
import type { NotificationSpec, NotificationToastSpec } from "../types/Notification"

export type NotificationToastCreateInput = {
  id: string
  toast: NotificationToastSpec
  target: NotificationSpec["target"]
}

export function createNotificationToast(input: NotificationToastCreateInput): void {
  const { id, toast, target } = input
  let action: { label: string; onClick: () => void } | undefined
  if (toast.action === "open") {
    if (target) {
      action = {
        label: "Open",
        onClick: () => navigateToTarget(target),
      }
    }
  } else if (toast.action) {
    action = toast.action
  }

  toaster.create({
    id,
    title: toast.title,
    description: toast.description,
    type: toast.type ?? "info",
    duration: toast.duration ?? 5000,
    closable: true,
    ...(action ? { action } : {}),
    meta: {
      closable: true,
      ...(toast.secondaryAction
        ? { secondaryAction: toast.secondaryAction }
        : {}),
    },
  })
}

export function dismissNotificationToast(id: string): void {
  toaster.dismiss(id)
}

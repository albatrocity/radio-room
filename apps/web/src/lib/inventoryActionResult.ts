import { toaster } from "../components/ui/toaster"
import {
  subscribeForSocketResult,
  type SubscribeForSocketResultOptions,
} from "./subscribeForSocketResult"

export type InventoryActionResult = {
  success: boolean
  title?: string
  message?: string
  duration?: number
  toastType?: "success" | "warning" | "error" | "info"
}

function toastTypeFor(data: InventoryActionResult): "success" | "warning" | "error" | "info" {
  if (data.toastType) return data.toastType
  if (data.success) return "success"
  const blocked = typeof data.message === "string" && data.message.toLowerCase().includes("blocked")
  return blocked ? "warning" : "error"
}

/** Subscribe to `INVENTORY_ACTION_RESULT` and toast success / blocked / error. */
export function subscribeInventoryActionResult(
  options: {
    id: string
    onSettled?: () => void
  } & Pick<SubscribeForSocketResultOptions<InventoryActionResult>, "onTimeout">,
): () => void {
  return subscribeForSocketResult<InventoryActionResult>({
    id: options.id,
    eventType: "INVENTORY_ACTION_RESULT",
    onResult: (data) => {
      options.onSettled?.()
      const type = toastTypeFor(data)
      toaster.create({
        title: data.title ?? (data.success ? "Success" : type === "warning" ? "Blocked" : "Error"),
        description: data.message || (data.success ? "Action completed" : "Action failed"),
        type,
        closable: true,
        meta: { closable: true },
        ...(data.duration != null ? { duration: data.duration } : {}),
      })
    },
    onTimeout: () => options.onTimeout?.(),
  })
}

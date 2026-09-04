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
      const blocked =
        !data.success &&
        typeof data.message === "string" &&
        data.message.toLowerCase().includes("blocked")
      toaster.create({
        title: data.title ?? (data.success ? "Success" : blocked ? "Blocked" : "Error"),
        description: data.message || (data.success ? "Action completed" : "Action failed"),
        type: data.success ? "success" : blocked ? "warning" : "error",
        ...(data.duration != null ? { duration: data.duration } : {}),
      })
    },
    onTimeout: () => options.onTimeout?.(),
  })
}

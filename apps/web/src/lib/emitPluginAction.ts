import { emitToSocket } from "../actors/socketActor"
import { toaster } from "../components/ui/toaster"
import { subscribeForSocketResult } from "./subscribeForSocketResult"

type PluginActionResult = {
  success: boolean
  message?: string
}

/**
 * Dispatch `EXECUTE_PLUGIN_ACTION` and wait for `PLUGIN_ACTION_RESULT`.
 * Shop detail Buy and plugin `ButtonTemplateComponent` share this ack path.
 */
export function emitPluginAction(
  pluginName: string,
  action: string,
  options?: {
    onSettled?: (data: PluginActionResult) => void
    onTimeout?: () => void
  },
): () => void {
  const id = `plugin-action-${pluginName}-${action}-${Date.now()}`
  const cancel = subscribeForSocketResult<PluginActionResult>({
    id,
    eventType: "PLUGIN_ACTION_RESULT",
    onResult: (data) => {
      options?.onSettled?.(data)
      toaster.create({
        title: data.success ? "Success" : "Error",
        description: data.message || (data.success ? "Action completed" : "Action failed"),
        type: data.success ? "success" : "error",
      })
    },
    onTimeout: options?.onTimeout,
  })
  emitToSocket("EXECUTE_PLUGIN_ACTION", { pluginName, action })
  return cancel
}

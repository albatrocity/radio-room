import { z } from "zod"
import type { PluginComponentSchema, PluginConfigSchema } from "@repo/types"
import { SKIPPER_STORE_KEYS, skipperConfigSchema } from "./types"

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(skipperConfigSchema),
    layout: [
      { type: "heading", content: "Skipper" },
      {
        type: "text-block",
        variant: "info",
        content:
          "Assign the Skipper persona from a listener's menu (including your own). Skippers get a Skip button in the player controls while another track is waiting in the queue. App-controlled rooms only. When queue auto-advance is off, Skip pauses the current track instead of starting the next.",
      },
      "enabled",
      "skipLimit",
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Skipper",
        description: "When enabled, admins can assign the Skipper persona.",
      },
      skipLimit: {
        type: "number",
        label: "Skip limit",
        description:
          "Skips each Skipper gets. 0 means unlimited. The last skip removes the Skipper persona; reassigning it starts a fresh limit.",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}

export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "skipper-skip",
        type: "button",
        area: "playerControls",
        label: "Skip",
        icon: "SkipForward",
        iconOnly: true,
        action: "skip",
        confirmMessage: "Skip the current track for everyone in the room?",
        confirmText: "Skip",
        variant: "ghost",
        size: "md",
        showWhen: [
          { field: "enabled", value: true },
          { field: "canSkip", value: true },
          { field: "skipperUserIds", includes: "viewer.userId" },
        ],
      },
    ],
    storeKeys: [...SKIPPER_STORE_KEYS],
  }
}

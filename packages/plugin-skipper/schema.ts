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
          "Assign the Skipper persona from a listener's menu (including your own). Skippers get a Skip button in the player controls while another track is waiting in the queue. App-controlled rooms only. When queue auto-advance is off, Skip pauses the current track instead of starting the next. Optionally let listeners skip songs they queued without the Skipper persona.",
      },
      "enabled",
      "skipLimit",
      "skipOwnTracks",
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
      skipOwnTracks: {
        type: "boolean",
        label: "Users can skip songs they queued",
        description:
          "While a song they added is playing, that listener gets the Skip button without the Skipper persona or spending a Skipper allowance.",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}

const skipButtonBase = {
  type: "button" as const,
  area: "playerControls" as const,
  label: "Skip",
  icon: "SkipForward",
  iconOnly: true,
  action: "skip",
  confirmMessage: "Skip the current track for everyone in the room?",
  confirmText: "Skip",
  variant: "ghost" as const,
  size: "md" as const,
}

export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        ...skipButtonBase,
        id: "skipper-skip",
        showWhen: [
          { field: "enabled", value: true },
          { field: "canSkip", value: true },
          { field: "skipperUserIds", includes: "viewer.userId" },
        ],
      },
      {
        ...skipButtonBase,
        id: "skipper-skip-own",
        showWhen: [
          { field: "enabled", value: true },
          { field: "canSkip", value: true },
          { field: "ownTrackUserIds", includes: "viewer.userId" },
          { field: "skipperUserIds", notIncludes: "viewer.userId" },
        ],
      },
    ],
    storeKeys: [...SKIPPER_STORE_KEYS],
  }
}

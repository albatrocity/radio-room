import { z } from "zod"
import type { PluginConfigSchema, PluginComponentSchema } from "@repo/types"
import { volumeManagerConfigSchema } from "./types"

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(volumeManagerConfigSchema),
    layout: [
      { type: "heading", content: "Volume Manager" },
      {
        type: "text-block",
        variant: "info",
        content:
          "Control playback volume on the room creator's active device (Spotify Connect or bridge drivers). Use the Now Playing slider for live volume (admins). Use Current volume / Start each track at here for segment presets and per-track resets.",
      },
      "enabled",
      "volume",
      "setOnTrackStart",
      "startVolume",
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Volume Manager",
        description: "When enabled, volume controls and track-start resets are active.",
      },
      volume: {
        type: "percentage",
        label: "Current volume",
        description: "Applied immediately when saved or when a segment preset updates it.",
        showWhen: { field: "enabled", value: true },
      },
      setOnTrackStart: {
        type: "boolean",
        label: "Reset volume at each track start",
        description:
          "When enabled, each new track begins at Start each track at. Changing that value does not affect the current track.",
        showWhen: { field: "enabled", value: true },
      },
      startVolume: {
        type: "percentage",
        label: "Start each track at",
        description: "Volume applied when a new track begins (manual play, auto-advance, or skip).",
        showWhen: [
          { field: "enabled", value: true },
          { field: "setOnTrackStart", value: true },
        ],
      },
    },
  }
}

export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "volume-slider",
        type: "slider",
        area: "nowPlayingInfo",
        dataKey: "volume",
        icon: "Volume2",
        min: 0,
        max: 100,
        step: 1,
        action: "setVolume",
        adminOnly: true,
        showWhen: { field: "enabled", value: true },
      },
    ],
    storeKeys: ["volume"],
  }
}

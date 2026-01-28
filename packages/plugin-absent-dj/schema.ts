import { z } from "zod"
import type { PluginConfigSchema, PluginComponentSchema } from "@repo/types"
import { absentDjConfigSchema } from "./types"

/**
 * UI component schema for frontend rendering.
 * Defines the countdown display when an absent DJ's track is playing.
 */
export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      // Countdown text in now playing area
      {
        id: "absent-dj-countdown-text",
        type: "text-block",
        area: "nowPlayingInfo",
        showWhen: { field: "showCountdown", value: true },
        content: [
          { type: "text", content: "DJ {{absentUsername}} is absent " },
          {
            type: "component",
            name: "countdown",
            props: {
              startKey: "countdownStartTime",
              duration: "config.skipDelay",
            },
          },
        ],
      },
      // Skipped badge in now playing badge area
      {
        id: "absent-dj-skipped-badge",
        type: "badge",
        area: "nowPlayingBadge",
        showWhen: { field: "isSkipped", value: true },
        label: "Skipped (DJ absent)",
        variant: "warning",
        icon: "skip-forward",
      },
    ],
    storeKeys: ["showCountdown", "countdownStartTime", "absentUsername", "isSkipped"],
  }
}

/**
 * Configuration schema for dynamic form generation in admin UI.
 */
export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(absentDjConfigSchema),
    layout: [
      { type: "heading", content: "Absent DJ" },
      {
        type: "text-block",
        content:
          "Automatically skip tracks when the user who added them is no longer in the room.",
        variant: "info",
      },
      "enabled",
      "skipDelay",
      {
        type: "text-block",
        content:
          "If the DJ returns before the countdown ends, their track will continue playing.",
        variant: "info",
        showWhen: { field: "enabled", value: true },
      },
      { type: "heading", content: "Messages" },
      {
        type: "text-block",
        content:
          "Optional system messages. Use {{username}} for DJ name and {{title}} for track title.",
        variant: "info",
        showWhen: { field: "enabled", value: true },
      },
      "messageOnPlay",
      "messageOnSkip",
      { type: "heading", content: "Sound Effects" },
      "soundEffectOnSkip",
      "soundEffectOnSkipUrl",
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Absent DJ",
        description: "When enabled, tracks will be skipped if the DJ who added them is not present",
      },
      skipDelay: {
        type: "duration",
        label: "Skip Delay",
        description: "How long to wait before skipping (5-300 seconds)",
        displayUnit: "seconds",
        storageUnit: "milliseconds",
        showWhen: { field: "enabled", value: true },
      },
      messageOnPlay: {
        type: "string",
        label: "Message on Play",
        description:
          "System message when an absent DJ's track starts playing. Leave empty for no message.",
        showWhen: { field: "enabled", value: true },
      },
      messageOnSkip: {
        type: "string",
        label: "Message on Skip",
        description:
          "System message when a track is skipped. Leave empty for no message.",
        showWhen: { field: "enabled", value: true },
      },
      soundEffectOnSkip: {
        type: "boolean",
        label: "Play sound effect on skip",
        description: "When enabled, a sound effect will be played when a track is skipped",
        showWhen: { field: "enabled", value: true },
      },
      soundEffectOnSkipUrl: {
        type: "url",
        label: "Sound effect URL",
        description: "The URL of the sound effect to play when a track is skipped",
        showWhen: [
          { field: "enabled", value: true },
          { field: "soundEffectOnSkip", value: true },
        ],
      },
    },
  }
}

import { z } from "zod"
import type { PluginConfigSchema, PluginComponentSchema, PluginSchemaElement } from "@repo/types"
import { playlistDemocracyConfigSchema } from "./types"

/**
 * UI component schema for frontend rendering.
 * Defines the countdown timer, text block, and badge components.
 */
export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      // Countdown text in now playing area
      {
        id: "now-playing-countdown-text",
        type: "text-block",
        area: "nowPlayingInfo",
        showWhen: { field: "showCountdown", value: true },
        content: [
          { type: "text", content: "React with " },
          {
            type: "component",
            name: "emoji",
            props: { emoji: "{{config.reactionType}}" },
          },
          { type: "text", content: " to keep this track playing" },
          {
            type: "component",
            name: "countdown",
            props: {
              startKey: "trackStartTime",
              duration: "config.timeLimit",
            },
          },
        ],
      },
      // Skipped badge in now playing badge area
      {
        id: "now-playing-skipped-badge",
        type: "badge",
        area: "nowPlayingBadge",
        showWhen: { field: "isSkipped", value: true },
        label: "Skipped",
        variant: "warning",
        icon: "skip-forward",
        tooltip: "{{voteCount}}/{{requiredCount}} votes",
      },
    ],
    storeKeys: ["showCountdown", "trackStartTime", "isSkipped", "voteCount", "requiredCount"],
  }
}

/**
 * Configuration schema for dynamic form generation in admin UI.
 */
export function getConfigSchema(): PluginConfigSchema {
  const percentExampleBlock: PluginSchemaElement = {
    type: "text-block",
    content: [
      {
        type: "text",
        content:
          "Track will be skipped if it doesn't get {{thresholdValue}}% of listeners to react with ",
      },
      { type: "component", name: "emoji", props: { shortcodes: ":{{reactionType}}:" } },
      { type: "text", content: " within {{timeLimit:duration}}." },
    ],
    variant: "example",
    showWhen: [
      { field: "thresholdType", value: "percentage" },
      { field: "enabled", value: true },
    ],
  }

  const staticExampleBlock: PluginSchemaElement = {
    type: "text-block",
    content: [
      {
        type: "text",
        content:
          "Track will be skipped if it doesn't get {{thresholdValue}} listeners to react with ",
      },
      { type: "component", name: "emoji", props: { shortcodes: ":{{reactionType}}:" } },
      { type: "text", content: " within {{timeLimit:duration}}." },
    ],
    variant: "example",
    showWhen: [
      { field: "thresholdType", value: "static" },
      { field: "enabled", value: true },
    ],
  }

  return {
    jsonSchema: z.toJSONSchema(playlistDemocracyConfigSchema),
    layout: [
      { type: "heading", content: "Playlist Democracy" },
      {
        type: "text-block",
        content:
          "Automatically skip tracks that don't receive enough reactions from listeners within a time limit.",
        variant: "info",
      },
      "enabled",
      "reactionType",
      "timeLimit",
      "thresholdType",
      "thresholdValue",
      percentExampleBlock,
      staticExampleBlock,
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Playlist Democracy",
        description:
          "When enabled, tracks will be automatically skipped if they don't meet the reaction threshold",
      },
      reactionType: {
        type: "emoji",
        label: "Reaction Type",
        description: "Click to choose which emoji reaction to count for voting",
        showWhen: { field: "enabled", value: true },
      },
      timeLimit: {
        type: "duration",
        label: "Time Limit",
        description: "How long to wait before checking the threshold (10-300 seconds)",
        displayUnit: "seconds",
        storageUnit: "milliseconds",
        showWhen: { field: "enabled", value: true },
      },
      thresholdType: {
        type: "enum",
        label: "Threshold Type",
        description: "Choose between percentage of listeners or fixed count",
        enumLabels: {
          percentage: "Percentage of listeners",
          static: "Fixed number",
        },
        showWhen: { field: "enabled", value: true },
      },
      thresholdValue: {
        type: "number",
        label: "Threshold Value",
        description: "Percentage of listeners (1-100%) or number of reactions needed",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}

import { z } from "zod"
import type {
  PluginConfigSchema,
  PluginComponentSchema,
  PluginSchemaElement,
  PluginActionElement,
} from "@repo/types"
import { playlistDemocracyConfigSchema } from "./types"

/**
 * UI component schema for frontend rendering.
 * Defines the countdown timer, text block, badge, and competitive mode components.
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
            props: { emoji: "{{config.reactionType}}", size: "xs" },
          },
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
      // Competitive mode leaderboard button
      {
        id: "competitive-leaderboard-button",
        type: "button",
        area: "userList",
        label: "DJ Leaderboard",
        icon: "trophy",
        opensModal: "competitive-leaderboard-modal",
        showWhen: [
          { field: "enabled", value: true },
          { field: "competitiveModeEnabled", value: true },
        ],
        variant: "solid",
        size: "sm",
      },
      // Competitive mode leaderboard modal
      {
        id: "competitive-leaderboard-modal",
        type: "modal",
        area: "userList",
        title: "DJ Leaderboard",
        size: "md",
        showWhen: [
          { field: "enabled", value: true },
          { field: "competitiveModeEnabled", value: true },
        ],
        children: [
          {
            id: "competitive-leaderboard",
            type: "leaderboard",
            area: "userList",
            dataKey: "competitiveLeaderboard",
            title: "Top DJs",
            rowTemplate: [
              {
                type: "component",
                name: "username",
                props: { userId: "{{value}}", fallback: "{{username}}" },
              },
              { type: "text", content: ": {{score}} pts" },
            ],
            maxItems: 10,
            showRank: true,
          },
        ],
      },
    ],
    storeKeys: [
      "showCountdown",
      "trackStartTime",
      "isSkipped",
      "voteCount",
      "requiredCount",
      "competitiveLeaderboard",
      "competitiveModeEnabled",
    ],
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
      "skipRequiresQueue",
      "skipRequiresQueueMin",
      "soundEffectOnSkip",
      "soundEffectOnSkipUrl",
      { type: "heading", content: "Competitive Mode" },
      {
        type: "text-block",
        content:
          "Award points to DJs whose tracks survive the vote. Tracks that are not skipped earn 1 point for the user who queued them.",
        variant: "info",
        showWhen: { field: "enabled", value: true },
      },
      "competitiveModeEnabled",
      {
        type: "action",
        action: "resetCompetitiveLeaderboard",
        label: "Reset Leaderboard",
        variant: "destructive",
        confirmMessage:
          "Are you sure you want to reset the competitive leaderboard? This will clear all DJ scores. This action cannot be undone.",
        confirmText: "Reset Leaderboard",
        showWhen: [
          { field: "enabled", value: true },
          { field: "competitiveModeEnabled", value: true },
        ],
      } satisfies PluginActionElement,
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
      skipRequiresQueue: {
        type: "boolean",
        label: "Only skip when queue has tracks",
        description:
          "When enabled, tracks will not be skipped if the queue has too few tracks waiting",
        showWhen: { field: "enabled", value: true },
      },
      skipRequiresQueueMin: {
        type: "number",
        label: "Minimum queue length to skip",
        description: "Tracks will only be skipped if the queue has more than this many tracks",
        showWhen: [
          { field: "enabled", value: true },
          { field: "skipRequiresQueue", value: true },
        ],
      },
      soundEffectOnSkip: {
        type: "boolean",
        label: "Play sound effect on skip",
        description: "When enabled, a sound effect will be played when a track is skipped",
        showWhen: { field: "enabled", value: true },
      },
      soundEffectOnSkipUrl: {
        type: "url",
        label: "Sound effect on skip URL",
        description: "The URL of the sound effect to play when a track is skipped",
        showWhen: [
          { field: "enabled", value: true },
          { field: "soundEffectOnSkip", value: true },
        ],
      },
      competitiveModeEnabled: {
        type: "boolean",
        label: "Enable Competitive Mode",
        description:
          "When enabled, DJs earn points for tracks that survive the vote. A leaderboard button will appear in the user list.",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}

import { z } from "zod"
import type { PluginConfigSchema, PluginComponentSchema } from "@repo/types"
import { specialWordsConfigSchema } from "./types"

/**
 * UI component schema for frontend rendering.
 * Defines the leaderboard button and modal components.
 */
export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      // Button to open the leaderboard modal
      {
        id: "leaderboard-button",
        type: "button",
        area: "userList",
        label: "{{config.wordLabel}} Leaderboard",
        icon: "trophy",
        opensModal: "leaderboard-modal",
        showWhen: [
          { field: "enabled", value: true },
          { field: "showLeaderboard", value: true },
        ],
        variant: "ghost",
        size: "sm",
      },
      // Modal containing leaderboards
      {
        id: "leaderboard-modal",
        type: "modal",
        area: "userList",
        title: "{{config.wordLabel}} Leaderboard",
        size: "md",
        showWhen: [
          { field: "enabled", value: true },
          { field: "showLeaderboard", value: true },
        ],
        children: [
          {
            id: "users-leaderboard",
            type: "leaderboard",
            area: "userList",
            dataKey: "usersLeaderboard",
            title: "Top {{config.wordLabel:pluralize:2}} Users",
            rowTemplate: [
              {
                type: "component",
                name: "username",
                props: { userId: "{{value}}", fallback: "{{username}}" },
              },
              { type: "text", content: ": {{score}} {{config.wordLabel:pluralize:score}}" },
            ],
            maxItems: 10,
            showRank: true,
          },
          {
            id: "words-leaderboard",
            type: "leaderboard",
            area: "userList",
            dataKey: "allWordsLeaderboard",
            title: "Most Used {{config.wordLabel:pluralize:2}}",
            rowTemplate: '"{{value}}" - {{score}} uses',
            maxItems: 10,
            showRank: true,
          },
        ],
      },
    ],
    // Store keys that get updated from plugin events
    storeKeys: ["usersLeaderboard", "allWordsLeaderboard"],
  }
}

/**
 * Configuration schema for dynamic form generation in admin UI.
 */
export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(specialWordsConfigSchema),
    layout: [
      { type: "heading", content: "Special Words" },
      {
        type: "text-block",
        content: "Detect special words in chat messages and send alerts when they are found.",
        variant: "info",
      },
      "enabled",
      "words",
      "wordLabel",
      "sendMessageOnDetection",
      "messageTemplate",
      "showLeaderboard",
      "soundEffectOnDetection",
      "soundEffectOnDetectionUrl",
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Special Words Detection",
        description: "When enabled, the plugin will monitor chat for special words",
      },
      words: {
        type: "string-array",
        label: "Words to Detect",
        description: "List of words to watch for in chat messages (case-insensitive)",
        placeholder: "Enter a word and press Enter",
        showWhen: { field: "enabled", value: true },
      },
      wordLabel: {
        type: "string",
        label: "Word Label",
        description: "The label to use for 'word' for this plugin",
        placeholder: "Word",
        showWhen: { field: "enabled", value: true },
      },
      sendMessageOnDetection: {
        type: "boolean",
        label: "Send Message on Detection",
        description: "When enabled, the plugin will send a message when a special word is detected",
        showWhen: { field: "enabled", value: true },
      },
      messageTemplate: {
        type: "string",
        label: "Message Template",
        description:
          "Available variables: {{word}}, {{username}}, {{userRank}}, {{userAllWordsCount}}, {{userThisWordCount}}, {{totalWordsUsed}}, {{thisWordCount}}, {{thisWordRank}}",
        showWhen: [
          { field: "enabled", value: true },
          { field: "sendMessageOnDetection", value: true },
        ],
      },
      showLeaderboard: {
        type: "boolean",
        label: "Show Leaderboard",
        description: "Shows a button to open the leaderboard in a modal",
        showWhen: { field: "enabled", value: true },
      },
      soundEffectOnDetection: {
        type: "boolean",
        label: "Play sound effect on detection",
        description: "When enabled, a sound effect will be played when a special word is detected",
        showWhen: { field: "enabled", value: true },
      },
      soundEffectOnDetectionUrl: {
        type: "url",
        label: "Sound effect on detection URL",
        description: "The URL of the sound effect to play when a special word is detected",
        showWhen: [
          { field: "enabled", value: true },
          { field: "soundEffectOnDetection", value: true },
        ],
      },
    },
  }
}

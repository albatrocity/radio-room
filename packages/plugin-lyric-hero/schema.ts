import { z } from "zod"
import type { PluginActionElement, PluginComponentSchema, PluginConfigSchema } from "@repo/types"
import { lyricHeroConfigSchema, lyricHeroModeFieldMeta } from "./types"

export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "lyric-hero-card",
        type: "lyric-hero-card",
        area: "aboveChat",
        showWhen: { field: "roundActive", value: true },
      },
      {
        id: "lyric-hero-tab",
        type: "tab",
        area: "gameStateTab",
        label: "Lyric Hero",
        icon: "Music2",
        showWhen: { field: "enabled", value: true },
        children: [
          {
            id: "lyric-hero-status",
            type: "text-block",
            area: "gameStateTab",
            content: "{{statusMessage}}",
            showWhen: { field: "roundActive", value: true },
          },
          {
            id: "lyric-hero-leaderboard",
            type: "leaderboard",
            area: "gameStateTab",
            dataKey: "leaderboard",
            title: "Lyric Hero standings",
            rowTemplate: "{{username}} — {{score}}",
            maxItems: 25,
            showRank: true,
          },
        ],
      },
    ],
    storeKeys: [
      "roundActive",
      "mode",
      "phraseIndex",
      "phraseTotal",
      "acceptingGuesses",
      "puzzle",
      "leaderboard",
      "statusMessage",
      "autoAdvanceDeadline",
    ],
  }
}

const startSessionAction = {
  type: "action",
  action: "startSession",
  label: "Start Lyric Hero",
  variant: "solid",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

const advancePhraseAction = {
  type: "action",
  action: "advancePhrase",
  label: "Advance phrase",
  variant: "outline",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

const endSessionAction = {
  type: "action",
  action: "endSession",
  label: "End Lyric Hero",
  variant: "destructive",
  confirmMessage: "End the current Lyric Hero session?",
  confirmText: "End session",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

const importPhrasesAction = {
  type: "action",
  action: "importPhrases",
  label: "Import phrases",
  variant: "outline",
  showWhen: { field: "enabled", value: true },
  formFields: [
    {
      name: "rawText",
      label: "Phrases",
      type: "textarea",
      required: true,
      rows: 16,
      placeholder: "don't stop believin'\njust a small town girl\nliving in a lonely world",
    },
  ],
  configImport: {
    targetField: "phrases",
    modes: ["append", "replace"],
    sourceParam: "rawText",
    itemNoun: "phrases",
    helpText:
      "Paste one lyric phrase per line. Blank lines and # comments are ignored. Optional - / * / 1. list markers are stripped.",
  },
} satisfies PluginActionElement

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(lyricHeroConfigSchema),
    layout: [
      { type: "heading", content: "Lyric Hero" },
      {
        type: "text-block",
        content:
          "Complete a lyric phrase by guessing whole words. Wrong guesses are sour notes — too many and the crowd walks out. Requires an active game session for coin awards.",
        variant: "info",
      },
      "enabled",
      "mode",
      "missMax",
      "solveReward",
      "guessBonus",
      "playSoundEffects",
      "autoAdvance",
      "autoAdvanceDelaySec",
      "phrases",
      importPhrasesAction,
      { type: "heading", content: "Session controls" },
      startSessionAction,
      advancePhraseAction,
      endSessionAction,
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Lyric Hero",
        description: "When enabled, guests can play via the above-chat puzzle card.",
      },
      mode: {
        ...lyricHeroModeFieldMeta,
        showWhen: { field: "enabled", value: true },
      },
      missMax: {
        type: "number",
        label: "Crowd patience (unique wrong words)",
        description: "How many unique wrong guesses before the audience walks out.",
        showWhen: { field: "enabled", value: true },
      },
      solveReward: {
        type: "number",
        label: "Solve reward (coins)",
        description:
          "Cooperative: all online users. Competitive: exclusive winner. Inclusive: each solver.",
        showWhen: { field: "enabled", value: true },
      },
      guessBonus: {
        type: "number",
        label: "Bonus per word filled (coins)",
        description: "Awarded to solvers for each distinct word they revealed.",
        showWhen: { field: "enabled", value: true },
      },
      playSoundEffects: {
        type: "boolean",
        label: "Play sound effects",
        description: "Crowd reactions (yeah, sour notes, boos, walk-out) on guesses.",
        showWhen: { field: "enabled", value: true },
      },
      autoAdvance: {
        type: "boolean",
        label: "Auto-advance after phrase completes",
        description:
          "Cooperative: after solve or walk-out. Competitive: after a winner. Inclusive: after the first solver.",
        showWhen: { field: "enabled", value: true },
      },
      autoAdvanceDelaySec: {
        type: "number",
        label: "Auto-advance delay (seconds)",
        description: "How long to wait before advancing to the next phrase.",
        showWhen: [
          { field: "enabled", value: true },
          { field: "autoAdvance", value: true },
        ],
      },
      phrases: {
        type: "object-array",
        label: "Phrase bank",
        scope: "private",
        itemLabel: "Phrase",
        minItems: 0,
        showWhen: { field: "enabled", value: true },
        itemFields: [
          {
            name: "text",
            meta: {
              type: "string",
              label: "Lyric / phrase",
              placeholder: "Don't stop believin'",
            },
          },
        ],
      },
    },
    quickAccess: ["startSession", "advancePhrase", "endSession", "importPhrases"],
  }
}

import { z } from "zod"
import { participationModeFieldMeta } from "@repo/game-logic"
import type { PluginActionElement, PluginComponentSchema, PluginConfigSchema } from "@repo/types"
import { playlistBingoConfigSchema } from "./types"

export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "bingo-tab",
        type: "tab",
        area: "gameStateTab",
        label: "Bingo",
        icon: "Trophy",
        showWhen: { field: "enabled", value: true },
        children: [
          {
            id: "bingo-status",
            type: "text-block",
            area: "gameStateTab",
            content: "{{statusMessage}}",
            showWhen: { field: "roundActive", value: true },
          },
          {
            id: "bingo-card",
            type: "bingo-card",
            area: "gameStateTab",
            showWhen: { field: "enabled", value: true },
          },
        ],
      },
    ],
    storeKeys: ["roundActive", "category", "statusMessage"],
  }
}

const startRoundAction = {
  type: "action",
  action: "startRound",
  label: "Start bingo round",
  variant: "solid",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

const endRoundAction = {
  type: "action",
  action: "endRound",
  label: "End bingo round",
  variant: "destructive",
  confirmMessage: "End the current bingo round?",
  confirmText: "End round",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

const setCategoryAction = {
  type: "action",
  action: "setCategory",
  label: "Set category / year-decade range",
  variant: "outline",
  showWhen: { field: "enabled", value: true },
  formFields: [
    {
      name: "category",
      label: "Category",
      type: "select",
      required: true,
      options: [
        { label: "Release year", value: "releaseYear" },
        { label: "Release decade", value: "releaseDecade" },
        { label: "Mixed (criteria bank)", value: "mixed" },
      ],
    },
    {
      name: "yearStart",
      label: "Year start (release year)",
      type: "string",
      required: false,
    },
    {
      name: "yearEnd",
      label: "Year end (release year)",
      type: "string",
      required: false,
    },
    {
      name: "decadeStart",
      label: "Decade start (e.g. 1930)",
      type: "string",
      required: false,
    },
    {
      name: "decadeEnd",
      label: "Decade end (e.g. 2010)",
      type: "string",
      required: false,
    },
  ],
} satisfies PluginActionElement

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(playlistBingoConfigSchema),
    layout: [
      { type: "heading", content: "Playlist Bingo" },
      {
        type: "text-block",
        content:
          "Deal private bingo cards when a round starts. Playlist tracks mark matching cells. Requires an active game session for coin/score awards. Mixed criteria are authored below (private); use Quick Access to set year/decade category before starting.",
        variant: "info",
      },
      "enabled",
      "mode",
      "coinReward",
      "category",
      "yearStart",
      "yearEnd",
      "decadeStart",
      "decadeEnd",
      "criteria",
      "bingoMessageTemplate",
      "soundEffectOnBingo",
      "soundEffectOnBingoUrl",
      "winnerLabel",
      "winnerIcon",
      { type: "heading", content: "Round controls" },
      startRoundAction,
      endRoundAction,
      setCategoryAction,
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Playlist Bingo",
      },
      mode: {
        ...participationModeFieldMeta,
        showWhen: { field: "enabled", value: true },
      },
      coinReward: {
        type: "number",
        label: "Coins on bingo",
        showWhen: { field: "enabled", value: true },
      },
      category: {
        type: "enum",
        label: "Category",
        enumLabels: {
          releaseYear: "Release year",
          releaseDecade: "Release decade",
          mixed: "Mixed",
        },
        showWhen: { field: "enabled", value: true },
      },
      yearStart: {
        type: "number",
        label: "Year range start",
        showWhen: [
          { field: "enabled", value: true },
          { field: "category", value: "releaseYear" },
        ],
      },
      yearEnd: {
        type: "number",
        label: "Year range end",
        showWhen: [
          { field: "enabled", value: true },
          { field: "category", value: "releaseYear" },
        ],
      },
      decadeStart: {
        type: "number",
        label: "Decade range start (e.g. 1930)",
        showWhen: [
          { field: "enabled", value: true },
          { field: "category", value: "releaseDecade" },
        ],
      },
      decadeEnd: {
        type: "number",
        label: "Decade range end (e.g. 2010)",
        showWhen: [
          { field: "enabled", value: true },
          { field: "category", value: "releaseDecade" },
        ],
      },
      criteria: {
        type: "object-array",
        label: "Mixed criteria bank",
        scope: "private",
        itemLabel: "Criterion",
        minItems: 0,
        description:
          "At least 24 criteria required to start a Mixed round. Never shown to guests.",
        showWhen: [
          { field: "enabled", value: true },
          { field: "category", value: "mixed" },
        ],
        itemFields: [
          {
            name: "type",
            meta: {
              type: "enum",
              label: "Matcher",
              enumLabels: {
                releaseYearEq: "Release year equals",
                releaseYearBetween: "Release year between",
                artistContains: "Artist contains",
                titleContains: "Title contains",
                albumContains: "Album contains",
                addedByContains: "Added by contains",
                durationGt: "Duration greater than",
                durationLt: "Duration less than",
              },
            },
          },
          {
            name: "year",
            meta: { type: "number", label: "Year" },
          },
          {
            name: "startYear",
            meta: { type: "number", label: "Start year" },
          },
          {
            name: "endYear",
            meta: { type: "number", label: "End year" },
          },
          {
            name: "value",
            meta: { type: "string", label: "Text value" },
          },
          {
            name: "durationMs",
            meta: {
              type: "number",
              label: "Duration (ms)",
              description: "e.g. 180000 for 3:00",
            },
          },
        ],
      },
      bingoMessageTemplate: {
        type: "string",
        label: "Bingo message template",
        description: "Variables: {{username}}, {{coins}}",
        showWhen: { field: "enabled", value: true },
      },
      soundEffectOnBingo: {
        type: "boolean",
        label: "Play sound on bingo",
        showWhen: { field: "enabled", value: true },
      },
      soundEffectOnBingoUrl: {
        type: "url",
        label: "Sound effect URL",
        showWhen: [
          { field: "enabled", value: true },
          { field: "soundEffectOnBingo", value: true },
        ],
      },
      winnerLabel: {
        type: "string",
        label: "Bingo Winner persona",
        description: "Leave empty to disable. Cleared at the start of each new round.",
        showWhen: { field: "enabled", value: true },
      },
      winnerIcon: {
        type: "string",
        label: "Winner icon (Lucide name)",
        showWhen: { field: "enabled", value: true },
      },
    },
    quickAccess: ["startRound", "endRound"],
  }
}

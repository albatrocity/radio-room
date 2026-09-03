import { z } from "zod"
import type { PluginActionElement, PluginComponentSchema, PluginConfigSchema } from "@repo/types"
import { queueThemeConfigSchema } from "./types"

export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "queue-theme-brief-card",
        type: "queue-theme-brief-card",
        area: "aboveChat",
        showWhen: { field: "roundActive", value: true },
      },
      {
        id: "queue-theme-brief-card-add-to-queue",
        type: "queue-theme-brief-card",
        area: "addToQueue",
        showWhen: { field: "roundActive", value: true },
      },
      {
        id: "queue-theme-tab",
        type: "tab",
        area: "gameStateTab",
        label: "Queue Theme",
        icon: "Palette",
        showWhen: { field: "enabled", value: true },
        children: [
          {
            id: "queue-theme-status",
            type: "text-block",
            area: "gameStateTab",
            content: "{{statusMessage}}",
            showWhen: { field: "roundActive", value: true },
          },
          {
            id: "queue-theme-leaderboard",
            type: "leaderboard",
            area: "gameStateTab",
            dataKey: "standings",
            title: "Theme standings",
            rowTemplate: "{{username}} — {{score}}",
            maxItems: 25,
            showRank: true,
          },
        ],
      },
    ],
    storeKeys: ["roundActive", "decoyMode", "standings", "statusMessage"],
  }
}

const startRoundAction = {
  type: "action",
  action: "startRound",
  label: "Start round",
  variant: "solid",
  showWhen: { field: "enabled", value: true },
  formFields: [
    {
      name: "theme",
      label: "Theme",
      type: "textarea",
      required: true,
      rows: 3,
      placeholder: "Songs about driving",
    },
    {
      name: "reserveQueue",
      label: "Reserve current queue below a split?",
      type: "select",
      required: false,
      options: [
        { value: "false", label: "No" },
        { value: "true", label: "Yes — park existing queue below the divider" },
      ],
    },
    {
      name: "decoyTheme",
      label: "Decoy theme (optional)",
      type: "textarea",
      required: false,
      rows: 2,
      placeholder: "Leave blank for no decoy mode",
    },
    {
      name: "decoyCount",
      label: "Number of decoy players",
      type: "string",
      required: false,
      placeholder: "1",
    },
  ],
} satisfies PluginActionElement

const endRoundAction = {
  type: "action",
  action: "endRound",
  label: "End round",
  variant: "destructive",
  confirmMessage: "End the current Queue Theme round?",
  confirmText: "End round",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(queueThemeConfigSchema),
    layout: [
      { type: "heading", content: "Queue Theme" },
      {
        type: "text-block",
        content:
          "Run themed queue rounds with a per-track yes/no poll. The DJ who queued each track earns coins from yes minus no (never negative). Requires an active game session and works best with app-controlled playback so queue adds have an addedBy. Optional decoy mode privately assigns a fake theme to some listeners and adds a Decoy poll option.",
        variant: "info",
      },
      "enabled",
      "coinPerNetVote",
      "accusationReward",
      { type: "heading", content: "Round controls" },
      startRoundAction,
      endRoundAction,
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Queue Theme",
        description: "Show admin round controls and the theme card during an active round.",
      },
      coinPerNetVote: {
        type: "number",
        label: "Coins per net yes vote",
        description: "Payout = max(0, yes − no) × this value. Paid to the track’s DJ.",
      },
      accusationReward: {
        type: "number",
        label: "Decoy accusation reward",
        description:
          "In decoy mode, coins awarded to each voter who correctly picks Decoy when the track’s DJ has the decoy theme.",
      },
    },
    quickAccess: ["startRound", "endRound"],
  }
}

import { z } from "zod"
import type { PluginConfigSchema, PluginComponentSchema, PluginActionElement } from "@repo/types"
import { guessTheTuneConfigSchema } from "./types"

export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "guess-tune-leaderboard-button",
        type: "button",
        area: "userList",
        label: "Guess the Tune Leaderboard",
        icon: "trophy",
        opensModal: "guess-tune-leaderboard-modal",
        showWhen: [
          { field: "enabled", value: true },
          { field: "showLeaderboard", value: true },
        ],
        variant: "solid",
        size: "sm",
      },
      {
        id: "guess-tune-leaderboard-modal",
        type: "modal",
        area: "userList",
        title: "Guess the Tune Leaderboard",
        size: "md",
        showWhen: [
          { field: "enabled", value: true },
          { field: "showLeaderboard", value: true },
        ],
        children: [
          {
            id: "guess-tune-users-leaderboard",
            type: "leaderboard",
            area: "userList",
            dataKey: "usersLeaderboard",
            title: "Top players",
            rowTemplate: [
              {
                type: "component",
                name: "username",
                props: { userId: "{{value}}", fallback: "{{username}}" },
              },
              { type: "text", content: ": {{score}} points" },
            ],
            maxItems: 25,
            showRank: true,
          },
        ],
      },
    ],
    storeKeys: ["usersLeaderboard"],
  }
}

export function getConfigSchema(): PluginConfigSchema {
  const resetAction = {
    type: "action",
    action: "resetLeaderboard",
    label: "Reset leaderboard",
    variant: "destructive",
    confirmMessage:
      "Reset all Guess the Tune scores? This cannot be undone.",
    confirmText: "Reset leaderboard",
    showWhen: { field: "enabled", value: true },
  } satisfies PluginActionElement

  return {
    jsonSchema: z.toJSONSchema(guessTheTuneConfigSchema),
    layout: [
      { type: "heading", content: "Guess the Tune" },
      {
        type: "text-block",
        content:
          "Obscures now playing metadata and awards points when chat messages match the track (title, artist, or album).",
        variant: "info",
      },
      "enabled",
      "matchTitle",
      "matchArtist",
      "matchAlbum",
      "pointsTitle",
      "pointsArtist",
      "pointsAlbum",
      "speedMultiplier",
      "speedMultiplierWindowSec",
      "fuzzyThreshold",
      "showNowPlayingToAdmins",
      "showLeaderboard",
      "soundEffectOnMatch",
      "soundEffectOnMatchUrl",
      "messageTemplate",
      resetAction,
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Guess the Tune",
        description: "When enabled, now playing fields can be obscured and chat guesses score points.",
      },
      matchTitle: {
        type: "boolean",
        label: "Match track title",
        showWhen: { field: "enabled", value: true },
      },
      matchArtist: {
        type: "boolean",
        label: "Match artist name",
        showWhen: { field: "enabled", value: true },
      },
      matchAlbum: {
        type: "boolean",
        label: "Match album title",
        showWhen: { field: "enabled", value: true },
      },
      pointsTitle: {
        type: "number",
        label: "Points — title",
        showWhen: [{ field: "enabled", value: true }, { field: "matchTitle", value: true }],
      },
      pointsArtist: {
        type: "number",
        label: "Points — artist",
        showWhen: [{ field: "enabled", value: true }, { field: "matchArtist", value: true }],
      },
      pointsAlbum: {
        type: "number",
        label: "Points — album",
        showWhen: [{ field: "enabled", value: true }, { field: "matchAlbum", value: true }],
      },
      speedMultiplier: {
        type: "number",
        label: "Speed multiplier",
        description: "Multiply points when a correct guess happens within the window below.",
        showWhen: { field: "enabled", value: true },
      },
      speedMultiplierWindowSec: {
        type: "number",
        label: "Speed bonus window (seconds)",
        description: "From track start: guesses within this many seconds get the multiplier.",
        showWhen: { field: "enabled", value: true },
      },
      fuzzyThreshold: {
        type: "number",
        label: "Fuzzy match threshold (0–1)",
        description: "Higher = more lenient (Fuse.js). Try 0.35–0.5.",
        showWhen: { field: "enabled", value: true },
      },
      showNowPlayingToAdmins: {
        type: "boolean",
        label: "Show unobscured now playing to admins",
        description:
          "When off, admins see the same obscured UI as everyone else (client-side only).",
        showWhen: { field: "enabled", value: true },
      },
      showLeaderboard: {
        type: "boolean",
        label: "Show leaderboard button",
        showWhen: { field: "enabled", value: true },
      },
      soundEffectOnMatch: {
        type: "boolean",
        label: "Play sound on correct guess",
        showWhen: { field: "enabled", value: true },
      },
      soundEffectOnMatchUrl: {
        type: "url",
        label: "Sound effect URL",
        showWhen: [
          { field: "enabled", value: true },
          { field: "soundEffectOnMatch", value: true },
        ],
      },
      messageTemplate: {
        type: "string",
        label: "System message template",
        description:
          "Variables: {{username}}, {{propertyLabel}}, {{points}}, {{multiplierSuffix}}",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}

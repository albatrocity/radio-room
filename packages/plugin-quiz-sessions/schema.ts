import { z } from "zod"
import { participationModeFieldMeta } from "@repo/game-logic"
import type { PluginComponentSchema, PluginConfigSchema } from "@repo/types"
import { quizSessionsConfigSchema } from "./types"

/**
 * Component schema (ADR 0006). The active question renders above chat via the
 * `quiz-question-card` template; the running leaderboard lives in a game-state
 * tab. Store keys mirror the event payloads (see `QuizSessionsEvents`) so
 * `pluginComponentMachine` hydrates (via `getComponentState`) then live-updates.
 */
export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "quiz-question-card",
        type: "quiz-question-card",
        area: "aboveChat",
        showWhen: { field: "enabled", value: true },
      },
      {
        id: "quiz-tab",
        type: "tab",
        area: "gameStateTab",
        label: "Quiz",
        icon: "Brain",
        showWhen: { field: "enabled", value: true },
        children: [
          {
            id: "quiz-leaderboard",
            type: "leaderboard",
            area: "gameStateTab",
            dataKey: "leaderboard",
            title: "Quiz standings",
            rowTemplate: "{{username}} — {{score}} correct",
            maxItems: 25,
            showRank: true,
          },
        ],
      },
    ],
    storeKeys: ["activeQuestion", "leaderboard", "lastCorrectAnswer"],
  }
}

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(quizSessionsConfigSchema),
    layout: [
      { type: "heading", content: "Quiz Sessions" },
      {
        type: "text-block",
        content:
          "Run quiz rounds where guests answer questions in chat. Accepted answers are stored privately and never sent to guests. Requires an active game session for coin/score awards.",
        variant: "info",
      },
      "enabled",
      "mode",
      "coinReward",
      "autoAdvance",
      "autoAdvanceDelaySec",
      "correctAnswerTemplate",
      "winnerLabel",
      "winnerIcon",
      "questions",
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Quiz Sessions",
        description: "When enabled, chat guesses can be matched against the active quiz question.",
      },
      mode: {
        ...participationModeFieldMeta,
        showWhen: { field: "enabled", value: true },
      },
      coinReward: {
        type: "number",
        label: "Coins per correct answer",
        description: "Awarded to each correct guesser. Can be changed mid-session.",
        showWhen: { field: "enabled", value: true },
      },
      autoAdvance: {
        type: "boolean",
        label: "Auto-advance after a correct answer",
        showWhen: { field: "enabled", value: true },
      },
      autoAdvanceDelaySec: {
        type: "number",
        label: "Auto-advance delay (seconds)",
        description: "How long to wait after a correct answer before advancing.",
        showWhen: [
          { field: "enabled", value: true },
          { field: "autoAdvance", value: true },
        ],
      },
      correctAnswerTemplate: {
        type: "string",
        label: "Correct-answer message template",
        description: "Variables: {{username}}, {{coins}}. Never include the answer (PvG spoiler).",
        showWhen: { field: "enabled", value: true },
      },
      winnerLabel: {
        type: "string",
        label: "Winner persona",
        description:
          "Badge label assigned to the latest correct guesser. It stays on them until someone else answers correctly. Leave empty to disable.",
        placeholder: "In the Hot Seat",
        showWhen: { field: "enabled", value: true },
      },
      winnerIcon: {
        type: "string",
        label: "Winner icon",
        description: "Lucide icon name for the persona badge (e.g. Crown, Flame, Star).",
        showWhen: { field: "enabled", value: true },
      },
      questions: {
        type: "object-array",
        label: "Question bank",
        description:
          "Authored here and stored privately (ADR 0068) — accepted answers are never broadcast to guests.",
        scope: "private",
        itemLabel: "Question",
        minItems: 0,
        showWhen: { field: "enabled", value: true },
        itemFields: [
          {
            name: "text",
            meta: {
              type: "string",
              label: "Question",
              placeholder: "What song is this?",
            },
          },
          {
            name: "acceptedAnswers",
            meta: {
              type: "string-array",
              label: "Accepted answers",
              description: "Exact match, case-insensitive, whitespace-trimmed.",
            },
          },
        ],
      },
    },
  }
}

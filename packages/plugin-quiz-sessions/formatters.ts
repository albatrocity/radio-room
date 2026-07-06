import { interpolateTemplate } from "@repo/utils"
import type { QuizLeaderboardEntry } from "./types"

/**
 * System chat message posted when a session ends. Handles the empty leaderboard
 * (no one scored) case. Scoring lands in Phase 4; until then the leaderboard is
 * always empty here.
 */
export function formatLeaderboardChat(entries: QuizLeaderboardEntry[]): string {
  if (entries.length === 0) {
    return "🧠 Quiz over — no points scored this round."
  }
  const lines = entries.map((entry, index) => `${index + 1}. ${entry.username} — ${entry.score}`)
  return `🧠 Quiz results:\n${lines.join("\n")}`
}

/**
 * System chat message announcing a correct answer. Never include the answer text
 * (PvG spoiler). Used by the answer-detection path in Phase 4.
 */
export function formatCorrectAnswerChat(
  template: string,
  params: { username: string; coins: number },
): string {
  return interpolateTemplate(template, {
    username: params.username,
    coins: String(params.coins),
  })
}

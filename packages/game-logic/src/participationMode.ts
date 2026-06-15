import { z } from "zod"
import type { PluginFieldMeta } from "@repo/types"

/** How a plugin gates rewards on user actions. */
export type ParticipationMode = "competitive" | "inclusive"

export const PARTICIPATION_MODES = ["competitive", "inclusive"] as const satisfies readonly ParticipationMode[]

/** Zod schema for plugin config `mode` fields. Defaults to inclusive (PvG). */
export const participationModeSchema = z
  .enum(PARTICIPATION_MODES)
  .default("inclusive")

/** Admin UI hints for a `mode` config field. Spread and add `showWhen` in plugin schemas. */
export const participationModeFieldMeta = {
  type: "enum",
  label: "Participation mode",
  description:
    "Competitive (PvP): first correct guess wins for everyone. Inclusive (PvG): each listener earns independently; guesses are hidden from chat.",
  enumLabels: {
    competitive: "Competitive (PvP)",
    inclusive: "Inclusive (PvG)",
  },
} satisfies PluginFieldMeta

export function isInclusiveMode(mode: ParticipationMode | undefined | null): boolean {
  return mode === "inclusive"
}

export function isCompetitiveMode(mode: ParticipationMode | undefined | null): boolean {
  return mode === "competitive"
}

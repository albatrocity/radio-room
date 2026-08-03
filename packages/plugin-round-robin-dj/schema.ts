import { z } from "zod"
import type { PluginActionElement, PluginConfigSchema } from "@repo/types"
import { roundRobinDjConfigSchema } from "./types"

const advanceRoundAction = {
  type: "action",
  action: "advanceRound",
  label: "Advance round",
  variant: "solid",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(roundRobinDjConfigSchema),
    layout: [
      { type: "heading", content: "Round Robin DJ" },
      {
        type: "text-block",
        content:
          "Restrict deputy DJ queueing to rounds. Sequential mode discovers then locks turn order; non-sequential is first-come within each round. The Robin persona marks who may queue.",
        variant: "info",
      },
      "enabled",
      "mode",
      "autoAdvanceRounds",
      advanceRoundAction,
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Round Robin DJ",
        description: "When enabled, only eligible deputies (Robin) may add songs each round",
      },
      mode: {
        type: "enum",
        label: "Mode",
        description:
          "Sequential: turn order from first-round queue order, then enforce turns. Non-sequential: first-come first-serve within each round.",
        showWhen: { field: "enabled", value: true },
        enumLabels: {
          sequential: "Sequential",
          nonSequential: "Non-sequential (FCFS)",
        },
      },
      autoAdvanceRounds: {
        type: "boolean",
        label: "Auto-advance rounds",
        description:
          "When every deputy has queued once, automatically start the next round. Turn off to require Advance round.",
        showWhen: { field: "enabled", value: true },
      },
    },
    quickAccess: ["advanceRound"],
  }
}

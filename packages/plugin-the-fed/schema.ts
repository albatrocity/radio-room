import { z } from "zod"
import type { PluginActionElement, PluginConfigSchema } from "@repo/types"
import { theFedConfigSchema } from "./types"

const nudgeUpAction = {
  type: "action",
  action: "nudgeUp",
  label: "Nudge +10%",
  variant: "outline",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

const nudgeDownAction = {
  type: "action",
  action: "nudgeDown",
  label: "Nudge −10%",
  variant: "outline",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

const resetScaleAction = {
  type: "action",
  action: "resetScale",
  label: "Reset to 1.0",
  variant: "outline",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

const forceTickAction = {
  type: "action",
  action: "forceTick",
  label: "Force tick",
  variant: "solid",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

const exportMetricsAction = {
  type: "action",
  action: "exportMetrics",
  label: "Export metrics",
  variant: "outline",
  showWhen: { field: "enabled", value: true },
} satisfies PluginActionElement

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(theFedConfigSchema),
    layout: [
      { type: "heading", content: "The Fed" },
      {
        type: "text-block",
        content:
          "Watches session coin balances and moves shop prices (costScale) toward a target affordability. Observe records metrics only; Adjust actually moves the dial. Ticks still run when the room is below Min participants, but prices will not move. Earn scale stays a manual admin dial.",
        variant: "info",
      },
      "enabled",
      "mode",
      "tickSeconds",
      "targetAffordability",
      "wealthStatistic",
      "smoothing",
      "deadband",
      "maxStepPct",
      "minCostScale",
      "maxCostScale",
      "minParticipants",
      "basketPriceOverride",
      "announceChanges",
      { type: "heading", content: "Run of show" },
      nudgeUpAction,
      nudgeDownAction,
      resetScaleAction,
      forceTickAction,
      exportMetricsAction,
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable The Fed",
      },
      mode: {
        type: "enum",
        label: "Mode",
        description:
          "Observe records metrics only. Adjust moves costScale toward the target affordability.",
        enumLabels: {
          observe: "Observe",
          adjust: "Adjust",
        },
      },
      tickSeconds: {
        type: "number",
        label: "Tick interval (seconds)",
      },
      targetAffordability: {
        type: "number",
        label: "Target affordability",
        description: "Typical player should afford this many typical items (R*). Default 3.",
      },
      wealthStatistic: {
        type: "enum",
        label: "Wealth statistic",
        enumLabels: {
          median: "Median",
          mean: "Mean",
          trimmedMean: "Trimmed mean",
        },
      },
      smoothing: {
        type: "number",
        label: "Smoothing (α)",
        description: "Geometric smoothing in log space. 0.25 absorbs a shock over ~4–6 ticks.",
      },
      deadband: {
        type: "number",
        label: "Deadband",
        description: "Hold when affordability is within this fraction of the target (0.15 = ±15%).",
      },
      maxStepPct: {
        type: "number",
        label: "Max step",
        description: "Cap on multiplicative costScale change per tick (0.10 = ±10%).",
      },
      minCostScale: {
        type: "number",
        label: "Min cost scale",
      },
      maxCostScale: {
        type: "number",
        label: "Max cost scale",
      },
      minParticipants: {
        type: "number",
        label: "Min participants",
        description:
          "Hold prices until this many session participants exist (default 3). A 2-player test room will tick but not move costScale until you lower this.",
      },
      basketPriceOverride: {
        type: "number",
        label: "Basket price override",
        description: "Optional typical-item price. Blank uses the median catalog coinValue.",
      },
      announceChanges: {
        type: "boolean",
        label: "Announce price changes",
        description: "Post a room system message when Adjust mode moves costScale.",
      },
      costScale: {
        type: "number",
        label: "Cost scale",
      },
      earnScale: {
        type: "number",
        label: "Earn scale",
      },
      affordability: {
        type: "number",
        label: "Affordability",
      },
      wealth: {
        type: "number",
        label: "Wealth",
      },
      flowRatio: {
        type: "number",
        label: "Coins / player / min (items)",
      },
      tickReason: {
        type: "enum",
        label: "Last tick",
        enumLabels: {
          idle: "Waiting for first tick",
          no_session: "Holding — no game session",
          min_participants: "Holding — not enough participants",
          zero_basket: "Holding — no basket price",
          deadband: "Holding — on target",
          observed: "Observed — would move",
          adjusted: "Moved cost scale",
        },
      },
      participantCount: {
        type: "number",
        label: "Participants counted",
      },
    },
    quickAccessStatus: [
      "costScale",
      "earnScale",
      "affordability",
      "wealth",
      "flowRatio",
      "tickReason",
      "participantCount",
    ],
    quickAccess: ["nudgeUp", "nudgeDown", "resetScale", "forceTick", "exportMetrics"],
  }
}

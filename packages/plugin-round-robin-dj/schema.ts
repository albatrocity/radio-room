import { z } from "zod"
import type { PluginActionElement, PluginComponentSchema, PluginConfigSchema } from "@repo/types"
import { QUEUE_STATUS_STORE_KEYS } from "./componentState"
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
          "Restrict deputy DJ queueing to rounds. Sequential and forward-and-back discover then lock turn order; non-sequential is first-come within each round. The Robin persona marks who may queue.",
        variant: "info",
      },
      "enabled",
      "mode",
      "autoAdvanceRounds",
      "deferOutOfTurnQueues",
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
          "Sequential: turn order from first-round queue order, then repeat from the start. Forward and back: same discovery, then reverse at each end so the last deputy goes first next round. Non-sequential: first-come first-serve within each round.",
        showWhen: { field: "enabled", value: true },
        enumLabels: {
          sequential: "Sequential",
          forwardAndBack: "Forward and back",
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
      deferOutOfTurnQueues: {
        type: "boolean",
        label: "Allow early song selection",
        description:
          "Deputies may pick a song before their turn (held until their turn). During the first open round, a second pick is held for next round. Ordered modes only.",
        showWhen: [
          { field: "enabled", value: true },
          { field: "mode", value: ["sequential", "forwardAndBack"] },
        ],
      },
    },
    quickAccess: ["advanceRound"],
  }
}

/**
 * Add to Queue entitlement messages (room-wide store + viewer showWhen).
 */
export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "rr-your-turn",
        type: "text-block",
        area: "addToQueue",
        status: "success",
        alertVariant: "subtle",
        size: "sm",
        fontWeight: "semibold",
        content: "It's your turn to add a track to the queue",
        showWhen: [
          { field: "enabled", value: true },
          { field: "eligibleUserIds", includes: "viewer.userId" },
        ],
      },
      {
        id: "rr-hold-next-round",
        type: "text-block",
        area: "addToQueue",
        status: "info",
        alertVariant: "subtle",
        size: "sm",
        fontWeight: "medium",
        content:
          "You've already added a track for this round, but you can select one for the next round.",
        showWhen: [
          { field: "enabled", value: true },
          { field: "holdForNextRoundUserIds", includes: "viewer.userId" },
        ],
      },
      {
        id: "rr-other-turn",
        type: "text-block",
        area: "addToQueue",
        status: "warning",
        alertVariant: "subtle",
        size: "sm",
        fontWeight: "medium",
        content: [
          { type: "text", content: "It's " },
          {
            type: "component",
            name: "username",
            props: { userId: "{{currentTurnUserId}}" },
          },
          { type: "text", content: "'s turn" },
        ],
        showWhen: [
          { field: "enabled", value: true },
          { field: "hasSingleTurn", value: true },
          { field: "participantUserIds", includes: "viewer.userId" },
          { field: "eligibleUserIds", notIncludes: "viewer.userId" },
          { field: "holdForNextRoundUserIds", notIncludes: "viewer.userId" },
        ],
      },
    ],
    storeKeys: [...QUEUE_STATUS_STORE_KEYS],
  }
}

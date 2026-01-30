import { z } from "zod"
import type { PluginConfigSchema, PluginSchemaElement } from "@repo/types"
import { queueHygieneConfigSchema } from "./types"

/**
 * Configuration schema for dynamic form generation in admin UI.
 */
export function getConfigSchema(): PluginConfigSchema {
  const consecutiveExplanation: PluginSchemaElement = {
    type: "text-block",
    content:
      "When enabled, users cannot add songs back-to-back. They must wait for another DJ to add a song, OR wait for the cooldown period to expire.",
    variant: "info",
    showWhen: [
      { field: "enabled", value: true },
      { field: "preventConsecutive", value: true },
    ],
  }

  const cooldownExampleBlock: PluginSchemaElement = {
    type: "text-block",
    content:
      "Cooldown scales from {{baseCooldownMs:duration}} (few DJs, short queue) up to {{maxCooldownMs:duration}} (many DJs, long queue).",
    variant: "example",
    showWhen: [
      { field: "enabled", value: true },
      { field: "rateLimitEnabled", value: true },
    ],
  }

  return {
    jsonSchema: z.toJSONSchema(queueHygieneConfigSchema),
    layout: [
      { type: "heading", content: "Queue Hygiene" },
      {
        type: "text-block",
        content:
          "Prevent queue saturation by ensuring fair access for all DJs. Stops users from adding songs back-to-back when others are waiting.",
        variant: "info",
      },
      "enabled",

      { type: "heading", content: "Consecutive Track Prevention" },
      "preventConsecutive",
      consecutiveExplanation,

      { type: "heading", content: "Cooldown Settings" },
      {
        type: "text-block",
        content:
          "When a user tries to add consecutive tracks, a cooldown period applies. The cooldown can scale based on room activity.",
        variant: "info",
        showWhen: { field: "enabled", value: true },
      },
      "rateLimitEnabled",
      "baseCooldownMs",
      "maxCooldownMs",
      "cooldownScalesWithDjs",
      "cooldownScalesWithQueue",
      cooldownExampleBlock,

      { type: "heading", content: "Exemptions" },
      "exemptAdmins",
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Queue Hygiene",
        description: "When enabled, queue operations will be subject to fairness rules",
      },
      preventConsecutive: {
        type: "boolean",
        label: "Prevent Consecutive Tracks",
        description:
          "Block users from adding songs back-to-back when other DJs are in the room",
        showWhen: { field: "enabled", value: true },
      },
      rateLimitEnabled: {
        type: "boolean",
        label: "Enable Cooldown",
        description:
          "Apply a time-based cooldown when a user tries to add consecutive tracks",
        showWhen: { field: "enabled", value: true },
      },
      baseCooldownMs: {
        type: "duration",
        label: "Base Cooldown",
        description: "Minimum cooldown when there are few DJs and a short queue",
        displayUnit: "seconds",
        storageUnit: "milliseconds",
        showWhen: [
          { field: "enabled", value: true },
          { field: "rateLimitEnabled", value: true },
        ],
      },
      maxCooldownMs: {
        type: "duration",
        label: "Maximum Cooldown",
        description: "Maximum cooldown when there are many DJs and a long queue",
        displayUnit: "seconds",
        storageUnit: "milliseconds",
        showWhen: [
          { field: "enabled", value: true },
          { field: "rateLimitEnabled", value: true },
        ],
      },
      cooldownScalesWithDjs: {
        type: "boolean",
        label: "Scale with DJ Count",
        description: "Increase cooldown when more DJs are in the room",
        showWhen: [
          { field: "enabled", value: true },
          { field: "rateLimitEnabled", value: true },
        ],
      },
      cooldownScalesWithQueue: {
        type: "boolean",
        label: "Scale with Queue Length",
        description: "Increase cooldown when the queue is longer",
        showWhen: [
          { field: "enabled", value: true },
          { field: "rateLimitEnabled", value: true },
        ],
      },
      exemptAdmins: {
        type: "boolean",
        label: "Exempt Admins",
        description: "Room admins bypass all queue hygiene restrictions",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}

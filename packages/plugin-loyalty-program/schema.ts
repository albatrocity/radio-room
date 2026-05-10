import { z } from "zod"
import type { PluginConfigSchema } from "@repo/types"
import { loyaltyProgramConfigSchema } from "./types"

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(loyaltyProgramConfigSchema),
    layout: [
      { type: "heading", content: "Loyalty Program" },
      {
        type: "text-block",
        content:
          "Awards coins on an interval while listeners are connected. Session anchors persist across brief disconnects (mobile idle). Messages use {{coins}}, {{username}}, {{sessionMs:duration}}, {{intervalMinutes}}.",
        variant: "info",
      },
      "enabled",
      "intervalMinutes",
      "baseCoins",
      "scaleBonusPerInterval",
      "minSessionMinutes",
      "messageTemplate",
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Loyalty Program",
      },
      intervalMinutes: {
        type: "number",
        label: "Award interval (minutes)",
        description: "How often eligible users are evaluated while connected",
      },
      baseCoins: {
        type: "number",
        label: "Base coins per payout",
      },
      scaleBonusPerInterval: {
        type: "number",
        label: "Bonus coins per prior payout (linear scale)",
        description: "Second payout adds this once, third adds twice, etc., within the same game session.",
      },
      minSessionMinutes: {
        type: "number",
        label: "Minimum minutes before first payout",
      },
      messageTemplate: {
        type: "string",
        label: "Direct message template",
        description: "Sent only to the recipient’s client (private chat line).",
      },
    },
  }
}

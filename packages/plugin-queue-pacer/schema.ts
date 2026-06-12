import { z } from "zod"
import type { PluginConfigSchema, PluginComponentSchema } from "@repo/types"
import { queuePacerConfigSchema } from "./types"

/**
 * Configuration schema for dynamic form generation in admin UI.
 */
export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(queuePacerConfigSchema),
    layout: [
      { type: "heading", content: "Queue Pacer" },
      {
        type: "text-block",
        variant: "info",
        content:
          "Finish the queue by a target end time. Playback windows shrink dynamically as the queue grows; tracks that exceed their window are skipped automatically.",
      },
      "enabled",
      "endTime",
      "minPlaybackMs",
      "warnOnOverrun",
    ],
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Queue Pacer",
        description:
          "When enabled, tracks that overrun their computed playback window will be skipped automatically.",
      },
      endTime: {
        type: "datetime",
        label: "Show ends at",
        description: "Queue Pacer divides the remaining time across the remaining tracks.",
        showWhen: { field: "enabled", value: true },
      },
      minPlaybackMs: {
        type: "duration",
        label: "Minimum playback time",
        description:
          "Tracks always play at least this long, even if it means the show overruns the end time.",
        displayUnit: "seconds",
        storageUnit: "milliseconds",
        showWhen: { field: "enabled", value: true },
      },
      warnOnOverrun: {
        type: "boolean",
        label: "Warn in chat when stretching past end time",
        description: "Post a system message when the queue would overflow the target end time.",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}

/**
 * Component schema for declarative UI components.
 *
 * Components:
 * - Skip-amount message for the current track (visible when track exceeds budget)
 * - Paused state indicator (replaces message when paused)
 * - "Let it play" button (admin-only, cancels current track skip)
 * - "Saved" badge (shown after admin cancels a skip)
 */
export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      // Skip-amount badge for the current track, visible to all
      {
        id: "queue-pacer-countdown",
        type: "badge",
        area: "nowPlayingInfo",
        showWhen: [
          { field: "enabled", value: true },
          { field: "isPaused", value: false },
          { field: "currentTrackSkipCanceled", value: false },
          { field: "trackExceedsBudget", value: true },
          { field: "hasQueuedTracksBehind", value: true },
        ],
        label: "-{{skipAmountMs:mmss}}",
        icon: "ClockFading",
        tooltip:
          "The last {{skipAmountMs:mmss}} of this track will be skipped so we can make it through the queue. Budget of {{perTrackWindowMs:mmss}} per track.",
      },
      // Paused state replaces the live countdown
      {
        id: "queue-pacer-paused",
        type: "text-block",
        area: "nowPlayingInfo",
        showWhen: [
          { field: "enabled", value: true },
          { field: "isPaused", value: true },
          { field: "trackExceedsBudget", value: true },
          { field: "hasQueuedTracksBehind", value: true },
        ],
        content: [
          {
            type: "text",
            content: "Queue Pacer paused — {{pausedRemainingMs:duration}} remaining",
          },
        ],
        variant: "info",
        size: "xs",
      },
      // Admin-only "Let it play" button
      {
        id: "queue-pacer-cancel-skip",
        type: "button",
        area: "nowPlayingInfo",
        label: "Let it play",
        variant: "link",
        size: "sm",
        icon: "Heart",
        action: "cancelCurrentTrackSkip",
        adminOnly: true,
        showWhen: [
          { field: "enabled", value: true },
          { field: "currentTrackSkipCanceled", value: false },
          { field: "isPaused", value: false },
          { field: "trackExceedsBudget", value: true },
          { field: "hasQueuedTracksBehind", value: true },
        ],
      },
      // "Saved" badge after admin cancels a skip
      {
        id: "queue-pacer-saved-badge",
        type: "badge",
        area: "nowPlayingBadge",
        showWhen: { field: "currentTrackSkipCanceled", value: true },
        label: "Saved",
        variant: "success",
        icon: "Heart",
      },
    ],
    storeKeys: [
      "trackStartTime",
      "perTrackWindowMs",
      "currentTrackSkipCanceled",
      "isPaused",
      "pausedRemainingMs",
      "trackExceedsBudget",
      "skipAmountMs",
      "hasQueuedTracksBehind",
    ],
  }
}

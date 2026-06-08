import { z } from "zod"
import type { PluginConfigSchema, PluginComponentSchema } from "@repo/types"
import { timeCopConfigSchema } from "./types"

/**
 * Configuration schema for dynamic form generation in admin UI.
 */
export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(timeCopConfigSchema),
    layout: [
      { type: "heading", content: "Time Cop" },
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
        label: "Enable Time Cop",
        description:
          "When enabled, tracks that overrun their computed playback window will be skipped automatically.",
      },
      endTime: {
        type: "datetime",
        label: "Show ends at",
        description: "Time Cop divides the remaining time across the remaining tracks.",
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
 * - Countdown for the current track (visible to all when active and not paused)
 * - Paused state indicator (replaces countdown when paused)
 * - "Let it play" button (admin-only, cancels current track skip)
 * - "Saved" badge (shown after admin cancels a skip)
 */
export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      // Countdown for the current track, visible to all
      {
        id: "time-cop-countdown",
        type: "text-block",
        area: "nowPlayingInfo",
        showWhen: [
          { field: "enabled", value: true },
          { field: "isPaused", value: false },
          { field: "currentTrackSkipCanceled", value: false },
        ],
        content: [
          { type: "text", content: "Time Cop: " },
          {
            type: "component",
            name: "countdown",
            props: { startKey: "trackStartTime", duration: "perTrackWindowMs" },
          },
        ],
      },
      // Paused state replaces the live countdown
      {
        id: "time-cop-paused",
        type: "text-block",
        area: "nowPlayingInfo",
        showWhen: [
          { field: "enabled", value: true },
          { field: "isPaused", value: true },
        ],
        content: [{ type: "text", content: "Time Cop paused — {{pausedRemainingMs:duration}} remaining" }],
        variant: "info",
      },
      // Admin-only "Let it play" button
      {
        id: "time-cop-cancel-skip",
        type: "button",
        area: "nowPlayingInfo",
        label: "Let it play",
        icon: "Heart",
        action: "cancelCurrentTrackSkip",
        adminOnly: true,
        showWhen: [
          { field: "enabled", value: true },
          { field: "currentTrackSkipCanceled", value: false },
          { field: "isPaused", value: false },
        ],
      },
      // "Saved" badge after admin cancels a skip
      {
        id: "time-cop-saved-badge",
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
    ],
  }
}

import { z } from "zod"
import type { PluginActionElement, PluginComponentSchema, PluginConfigSchema } from "@repo/types"
import { TRIP_MAP_MAX_BYTES } from "@repo/road-trip-map"
import { ROAD_TRIP_TAB_ID, TRIP_STORE_KEYS, roadTripConfigSchema } from "./types"

const loadMapAction = {
  type: "action",
  action: "loadMap",
  label: "Load map",
  variant: "solid",
  formFields: [
    {
      name: "mapJson",
      label: "Trip Map JSON",
      type: "textarea",
      required: true,
      rows: 10,
      maxLength: TRIP_MAP_MAX_BYTES,
      placeholder: '{ "schemaVersion": 1, "id": "…", "sites": [ … ] }',
      helperText:
        "Paste a map from Game Studio's map editor. Replaces the loaded map until departure.",
    },
  ],
} satisfies PluginActionElement

const action = (
  id: string,
  label: string,
  variant: PluginActionElement["variant"] = "outline",
  confirmMessage?: string,
): PluginActionElement => ({
  type: "action",
  action: id,
  label,
  variant,
  ...(confirmMessage ? { confirmMessage, confirmText: label } : {}),
})

const ACTIONS: PluginActionElement[] = [
  loadMapAction,
  action(
    "unloadMap",
    "Unload map",
    "ghost",
    "Unload the map and leave trip mode? The trip log is cleared.",
  ),
  action("depart", "Depart", "solid"),
  action("pause", "Pause"),
  action("resume", "Resume"),
  action("leaveNow", "Leave now"),
  action("endTrip", "End trip", "destructive", "End the trip now?"),
  action(
    "newTrip",
    "New trip",
    "outline",
    "Start over with the same map? Visits and the trip log are cleared.",
  ),
]

export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(roadTripConfigSchema),
    layout: [
      { type: "heading", content: "Road Trip" },
      {
        type: "text-block",
        content:
          "Load a Trip Map, start a game session, and depart. The van drives in real time, polls the room before optional exits, and parks at sites that open their shop. Trip mode lasts while a map is loaded, whatever Enable says; Enable only shows Road Trip in Quick Access.",
        variant: "info",
      },
      "enabled",
      "exportTimeZone",
      { type: "heading", content: "Trip" },
      ...ACTIONS,
    ],
    fieldMeta: {
      enabled: { type: "boolean", label: "Show in Quick Access" },
      exportTimeZone: {
        type: "string",
        label: "Export time zone",
        description:
          "IANA zone for clock times in the room export timeline (e.g. America/Chicago).",
      },
      tripProgress: { type: "string", label: "Trip" },
      tripEta: { type: "string", label: "Arrival" },
      tripNextSite: { type: "string", label: "Next site" },
      tripWarnings: { type: "string", label: "Warnings" },
    },
    quickAccessStatus: ["tripProgress", "tripEta", "tripNextSite", "tripWarnings"],
    quickAccess: ACTIONS.map((a) => a.action),
  }
}

export function getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "road-trip-strip",
        type: "road-trip-strip",
        area: "aboveChat",
        showWhen: { field: "tripActive", value: true },
        tabId: ROAD_TRIP_TAB_ID,
      },
      {
        id: ROAD_TRIP_TAB_ID,
        type: "tab",
        area: "gameStateTab",
        label: "Trip",
        icon: "Map",
        showWhen: { field: "tripActive", value: true },
        children: [
          {
            id: "road-trip-trip-panel",
            type: "road-trip-trip-panel",
            area: "gameStateTab",
          },
        ],
      },
    ],
    storeKeys: [...TRIP_STORE_KEYS],
  }
}

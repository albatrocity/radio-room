import { z } from "zod"
import type { PluginActionElement, PluginComponentSchema, PluginConfigSchema } from "@repo/types"
import { INCIDENTS, TRIGGERABLE_INCIDENT_IDS, TRIP_MAP_MAX_BYTES } from "@repo/road-trip-map"
import {
  ROAD_TRIP_TAB_ID,
  ROAD_TRIP_VAN_TAB_ID,
  TRIP_STORE_KEYS,
  roadTripConfigSchema,
} from "./types"

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

const triggerIncidentAction = {
  type: "action",
  action: "triggerIncident",
  label: "Trigger incident",
  variant: "outline",
  formFields: [
    {
      name: "incident",
      label: "Incident",
      type: "select",
      required: true,
      options: TRIGGERABLE_INCIDENT_IDS.map((id) => ({
        value: id,
        label: `${INCIDENTS[id].emoji} ${INCIDENTS[id].name}`,
      })),
      helperText: "Starts now, or queues until the van leaves a stop.",
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
  action("switchFundsMode", "Switch funds mode"),
  action("depart", "Depart", "solid"),
  action("pause", "Pause"),
  action("resume", "Resume"),
  action("leaveNow", "Leave now"),
  triggerIncidentAction,
  action(
    "skipIncidentStep",
    "Skip incident step",
    "outline",
    "Skip the current incident step? A cost step is waived and refunded.",
  ),
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
      tripFuel: { type: "string", label: "Gas & funds" },
      tripWarnings: { type: "string", label: "Warnings" },
    },
    quickAccessStatus: ["tripProgress", "tripEta", "tripNextSite", "tripFuel", "tripWarnings"],
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
        id: "road-trip-pool",
        type: "pool-card",
        area: "aboveChat",
        showWhen: { field: "tripPoolOpen", value: true },
        poolKey: "tripPool",
        pledgeAction: "chipIn",
        pledgeLabel: "Chip in",
        defaultAmount: 5,
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
      {
        id: ROAD_TRIP_VAN_TAB_ID,
        type: "tab",
        area: "gameStateTab",
        label: "Van",
        icon: "Truck",
        showWhen: { field: "tripActive", value: true },
        children: [
          {
            id: "road-trip-van-panel",
            type: "road-trip-van-panel",
            area: "gameStateTab",
          },
        ],
      },
    ],
    storeKeys: [...TRIP_STORE_KEYS],
  }
}

import { assign, setup } from "xstate"

const STORAGE_PREFIX = "quickAccessPanels:"

export type QuickAccessPanelState = {
  open: boolean
}

export type QuickAccessPanelsMap = Record<string, QuickAccessPanelState>

export interface QuickAccessPanelsMachineContext {
  roomId: string | null
  panels: QuickAccessPanelsMap
}

export type QuickAccessPanelsEvent =
  | { type: "ACTIVATE"; roomId: string }
  | { type: "DEACTIVATE" }
  | { type: "TOGGLE"; pluginName: string }
  | { type: "CLOSE"; pluginName: string }
  | { type: "PRUNE"; enabledPluginNames: string[] }

function parsePanelState(raw: unknown): QuickAccessPanelState | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.open !== "boolean") return null
  return { open: obj.open }
}

export function loadQuickAccessPanels(roomId: string | null): QuickAccessPanelsMap {
  if (roomId == null || typeof sessionStorage === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + roomId)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const result: QuickAccessPanelsMap = {}
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      const panel = parsePanelState(value)
      if (panel) result[name] = panel
    }
    return result
  } catch {
    return {}
  }
}

export function saveQuickAccessPanels(roomId: string | null, panels: QuickAccessPanelsMap): void {
  if (roomId == null || typeof sessionStorage === "undefined") return
  // Persist open flags only (ignore legacy position/size keys if present in older saves).
  const openOnly: QuickAccessPanelsMap = {}
  for (const [name, panel] of Object.entries(panels)) {
    openOnly[name] = { open: panel.open }
  }
  sessionStorage.setItem(STORAGE_PREFIX + roomId, JSON.stringify(openOnly))
}

export const quickAccessPanelsMachine = setup({
  types: {
    context: {} as QuickAccessPanelsMachineContext,
    events: {} as QuickAccessPanelsEvent,
  },
  actions: {
    persistPanels: ({ context }) => {
      saveQuickAccessPanels(context.roomId, context.panels)
    },
    activateRoom: assign(({ event }) => {
      if (event.type !== "ACTIVATE") return {}
      return {
        roomId: event.roomId,
        panels: loadQuickAccessPanels(event.roomId),
      }
    }),
    deactivateRoom: assign(() => ({
      roomId: null,
      panels: {} as QuickAccessPanelsMap,
    })),
    togglePanel: assign(({ context, event }) => {
      if (event.type !== "TOGGLE") return {}
      const { pluginName } = event
      const existing = context.panels[pluginName]
      return {
        panels: {
          ...context.panels,
          [pluginName]: { open: !existing?.open },
        },
      }
    }),
    closePanel: assign(({ context, event }) => {
      if (event.type !== "CLOSE") return {}
      const existing = context.panels[event.pluginName]
      if (!existing) return {}
      return {
        panels: {
          ...context.panels,
          [event.pluginName]: { open: false },
        },
      }
    }),
    prunePanels: assign(({ context, event }) => {
      if (event.type !== "PRUNE") return {}
      const allowed = new Set(event.enabledPluginNames)
      let changed = false
      const next: QuickAccessPanelsMap = {}
      for (const [name, panel] of Object.entries(context.panels)) {
        if (allowed.has(name)) {
          next[name] = panel
        } else {
          changed = true
        }
      }
      if (!changed) return {}
      return { panels: next }
    }),
  },
}).createMachine({
  id: "quickAccessPanels",
  context: {
    roomId: null,
    panels: {},
  },
  initial: "inactive",
  states: {
    inactive: {
      on: {
        ACTIVATE: {
          target: "active",
          actions: "activateRoom",
        },
      },
    },
    active: {
      on: {
        ACTIVATE: {
          actions: ["activateRoom", "persistPanels"],
        },
        DEACTIVATE: {
          target: "inactive",
          actions: "deactivateRoom",
        },
        TOGGLE: {
          actions: ["togglePanel", "persistPanels"],
        },
        CLOSE: {
          actions: ["closePanel", "persistPanels"],
        },
        PRUNE: {
          actions: ["prunePanels", "persistPanels"],
        },
      },
    },
  },
})

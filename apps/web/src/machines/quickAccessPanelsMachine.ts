import { assign, setup } from "xstate"

const STORAGE_PREFIX = "quickAccessPanels:"

export const QUICK_ACCESS_DEFAULT_SIZE = { width: 320, height: 360 }

/** Reject sizes that can't be a usable panel (e.g. leftover minimized heights). */
const MIN_PERSISTED_WIDTH = 200
const MIN_PERSISTED_HEIGHT = 120

export type QuickAccessPanelGeometry = {
  position?: { x: number; y: number }
  size?: { width: number; height: number }
}

export type QuickAccessPanelState = QuickAccessPanelGeometry & {
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
  | {
      type: "SET_GEOMETRY"
      pluginName: string
      position?: { x: number; y: number }
      size?: { width: number; height: number }
    }
  | { type: "PRUNE"; enabledPluginNames: string[] }

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n)
}

function parsePanelState(raw: unknown): QuickAccessPanelState | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.open !== "boolean") return null

  const position =
    obj.position &&
    typeof obj.position === "object" &&
    isFiniteNumber((obj.position as { x?: unknown }).x) &&
    isFiniteNumber((obj.position as { y?: unknown }).y)
      ? { x: (obj.position as { x: number }).x, y: (obj.position as { y: number }).y }
      : undefined

  let size: { width: number; height: number } | undefined
  if (
    obj.size &&
    typeof obj.size === "object" &&
    isFiniteNumber((obj.size as { width?: unknown }).width) &&
    isFiniteNumber((obj.size as { height?: unknown }).height)
  ) {
    const width = (obj.size as { width: number }).width
    const height = (obj.size as { height: number }).height
    if (width >= MIN_PERSISTED_WIDTH && height >= MIN_PERSISTED_HEIGHT) {
      size = { width, height }
    }
  }

  return { open: obj.open, ...(position ? { position } : {}), ...(size ? { size } : {}) }
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
  sessionStorage.setItem(STORAGE_PREFIX + roomId, JSON.stringify(panels))
}

function countOpenPanels(panels: QuickAccessPanelsMap): number {
  return Object.values(panels).filter((p) => p.open).length
}

function cascadePosition(openCount: number): { x: number; y: number } {
  const offset = openCount * 28
  return { x: 48 + offset, y: 72 + offset }
}

function isUsablePosition(position: { x: number; y: number } | undefined): boolean {
  if (!position) return false
  if (typeof window === "undefined") return true
  const { innerWidth, innerHeight } = window
  // Require at least part of the panel header to remain on-screen.
  return (
    position.x > -200 &&
    position.y > -40 &&
    position.x < innerWidth - 40 &&
    position.y < innerHeight - 40
  )
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
      if (existing?.open) {
        return {
          panels: {
            ...context.panels,
            [pluginName]: { ...existing, open: false },
          },
        }
      }

      const openCount = countOpenPanels(context.panels)
      const storedPosition = existing?.position
      const position = isUsablePosition(storedPosition)
        ? storedPosition
        : cascadePosition(openCount)

      return {
        panels: {
          ...context.panels,
          [pluginName]: {
            open: true,
            position,
            size: existing?.size ?? { ...QUICK_ACCESS_DEFAULT_SIZE },
          },
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
          [event.pluginName]: { ...existing, open: false },
        },
      }
    }),
    setGeometry: assign(({ context, event }) => {
      if (event.type !== "SET_GEOMETRY") return {}
      const existing = context.panels[event.pluginName] ?? { open: true }
      const nextSize =
        event.size &&
        event.size.width >= MIN_PERSISTED_WIDTH &&
        event.size.height >= MIN_PERSISTED_HEIGHT
          ? event.size
          : undefined
      return {
        panels: {
          ...context.panels,
          [event.pluginName]: {
            ...existing,
            ...(event.position ? { position: event.position } : {}),
            ...(nextSize ? { size: nextSize } : {}),
          },
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
        SET_GEOMETRY: {
          actions: ["setGeometry", "persistPanels"],
        },
        PRUNE: {
          actions: ["prunePanels", "persistPanels"],
        },
      },
    },
  },
})

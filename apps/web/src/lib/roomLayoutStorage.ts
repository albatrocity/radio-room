export const ROOM_LAYOUT_STORAGE_KEY = "roomLayout:v1"

export type RoomLayoutKey = "3" | "4"

export type RoomPanelId = "player" | "chat" | "sidebar" | "panel"

export const ROOM_PANEL_IDS_3: RoomPanelId[] = ["player", "chat", "sidebar"]
export const ROOM_PANEL_IDS_4: RoomPanelId[] = ["player", "chat", "sidebar", "panel"]

export const DEFAULT_LAYOUT_3: number[] = [22, 53, 25]
export const DEFAULT_LAYOUT_4: number[] = [18, 42, 20, 20]

export type RoomLayoutState = {
  layout3: number[]
  layout4: number[]
}

export const INTEGRATED_PANEL_MIN_WIDTH = "440px"

export type RoomPanelConstraints = {
  minSize?: number | string
  maxSize?: number | string
}

export const ROOM_PANEL_CONSTRAINTS: Record<RoomPanelId, RoomPanelConstraints> = {
  player: { minSize: 15, maxSize: 35 },
  chat: { minSize: 25 },
  sidebar: { minSize: 12, maxSize: 30 },
  panel: { minSize: INTEGRATED_PANEL_MIN_WIDTH, maxSize: 35 },
}

function isValidSizeArray(value: unknown, length: number): value is number[] {
  if (!Array.isArray(value) || value.length !== length) return false
  return value.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
}

export function normalizeLayoutSizes(sizes: number[]): number[] {
  const total = sizes.reduce((sum, n) => sum + n, 0)
  if (total <= 0) return sizes
  return sizes.map((n) => (n / total) * 100)
}

export function getDefaultLayout(key: RoomLayoutKey): number[] {
  return key === "4" ? [...DEFAULT_LAYOUT_4] : [...DEFAULT_LAYOUT_3]
}

export function getPanelIds(key: RoomLayoutKey): RoomPanelId[] {
  return key === "4" ? [...ROOM_PANEL_IDS_4] : [...ROOM_PANEL_IDS_3]
}

export function loadRoomLayout(): RoomLayoutState {
  const fallback: RoomLayoutState = {
    layout3: [...DEFAULT_LAYOUT_3],
    layout4: [...DEFAULT_LAYOUT_4],
  }

  if (typeof localStorage === "undefined") return fallback

  try {
    const raw = localStorage.getItem(ROOM_LAYOUT_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback

    const obj = parsed as Record<string, unknown>
    const layout3 = isValidSizeArray(obj.layout3, 3)
      ? normalizeLayoutSizes(obj.layout3)
      : fallback.layout3
    const layout4 = isValidSizeArray(obj.layout4, 4)
      ? normalizeLayoutSizes(obj.layout4)
      : fallback.layout4

    return { layout3, layout4 }
  } catch {
    return fallback
  }
}

export function saveRoomLayout(state: RoomLayoutState): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(
    ROOM_LAYOUT_STORAGE_KEY,
    JSON.stringify({
      layout3: normalizeLayoutSizes(state.layout3),
      layout4: normalizeLayoutSizes(state.layout4),
    }),
  )
}

export function buildSplitterPanels(key: RoomLayoutKey) {
  return getPanelIds(key).map((id) => ({
    id,
    ...ROOM_PANEL_CONSTRAINTS[id],
  }))
}

/** Client for the dev-server trip map middleware (`vite.config.ts`, `maps/<id>.json`). */
const BASE = "/__studio/trip-maps"

/** Required on writes by the dev middleware's guard (`vite/studioRequestGuard.ts`). */
const STUDIO_HEADERS = { "X-Studio-Request": "1" }

export async function listSavedTripMaps(): Promise<string[]> {
  try {
    const res = await fetch(BASE)
    if (!res.ok) return []
    const body = (await res.json()) as { ids?: string[] }
    return body.ids ?? []
  } catch {
    return []
  }
}

export async function loadSavedTripMap(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`)
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

export async function saveTripMapFile(
  id: string,
  json: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...STUDIO_HEADERS },
      body: json,
    })
    if (res.ok) return { ok: true }
    return { ok: false, message: (await res.text()) || `HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, message: String(error) }
  }
}

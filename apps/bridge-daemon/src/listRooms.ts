export type DiscoveredRoom = {
  id: string
  title: string
  type: string
  playbackControllerId: string
  playbackMode: string
  public: boolean
  /** True when this room is configured for the bridge daemon. */
  bridgeReady: boolean
}

export function sortDiscoveredRooms(rooms: DiscoveredRoom[]): DiscoveredRoom[] {
  return [...rooms].sort((a, b) => {
    if (a.bridgeReady !== b.bridgeReady) return a.bridgeReady ? -1 : 1
    return a.title.localeCompare(b.title)
  })
}

/**
 * Rooms from GET /api/device/rooms. The daemon does not read Redis.
 */
export async function listRoomsFromApi(apiBaseUrl: string, bearer: string): Promise<DiscoveredRoom[]> {
  const base = apiBaseUrl.replace(/\/$/, "")
  const res = await fetch(`${base}/api/device/rooms`, {
    headers: { Authorization: `Bearer ${bearer}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`rooms ${res.status} ${text.slice(0, 200)}`)
  }
  const body = (await res.json()) as { rooms?: DiscoveredRoom[] }
  return sortDiscoveredRooms(body.rooms ?? [])
}

import ky from "ky"
import type { ShowDTO, ShowFilters } from "@repo/types"
import { SESSION_ID } from "../constants"

const API_URL = import.meta.env.VITE_API_URL

const RADIO_SESSION_HEADER = "X-Radio-Session-Id"

const api = ky.create({
  prefixUrl: API_URL,
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
  retry: 2,
})

function toSearchParams(obj: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  return params
}

export async function fetchShows(filters: ShowFilters = {}): Promise<ShowDTO[]> {
  const res = await api.get("api/scheduling/shows", {
    searchParams: toSearchParams(filters as Record<string, unknown>),
  })
  const data = await res.json<{ shows: ShowDTO[] }>()
  return data.shows
}

export async function fetchShow(
  id: string,
  options?: { roomId?: string },
): Promise<ShowDTO> {
  const headers: Record<string, string> = {}
  const sid = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_ID) : null
  if (sid) headers[RADIO_SESSION_HEADER] = sid

  const res = await api.get(`api/scheduling/shows/${id}`, {
    headers,
    ...(options?.roomId
      ? { searchParams: { roomId: options.roomId } }
      : {}),
  })
  const data = await res.json<{ show: ShowDTO }>()
  return data.show
}

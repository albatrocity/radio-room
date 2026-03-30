import ky from "ky"
import type {
  ShowDTO,
  SegmentDTO,
  TagDTO,
  CreateShowRequest,
  UpdateShowRequest,
  CreateSegmentRequest,
  UpdateSegmentRequest,
  CreateTagRequest,
  ShowFilters,
  SegmentFilters,
  TagType,
  SchedulingAdminUserDTO,
} from "@repo/types"

const API_URL = import.meta.env.VITE_API_URL || ""

const api = ky.create({
  prefixUrl: API_URL,
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
  retry: 1,
})

function toSearchParams(obj: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v))
    } else {
      params.set(key, String(value))
    }
  }
  return params
}

// ---------------------------------------------------------------------------
// Shows
// ---------------------------------------------------------------------------

export async function fetchShows(filters: ShowFilters = {}): Promise<ShowDTO[]> {
  const res = await api.get("api/scheduling/shows", { searchParams: toSearchParams(filters as any) })
  const data = await res.json<{ shows: ShowDTO[] }>()
  return data.shows
}

export async function fetchShow(id: string): Promise<ShowDTO> {
  const res = await api.get(`api/scheduling/shows/${id}`)
  const data = await res.json<{ show: ShowDTO }>()
  return data.show
}

export async function createShow(body: CreateShowRequest): Promise<ShowDTO> {
  const res = await api.post("api/scheduling/shows", { json: body })
  const data = await res.json<{ show: ShowDTO }>()
  return data.show
}

export async function updateShow(id: string, body: UpdateShowRequest): Promise<ShowDTO> {
  const res = await api.put(`api/scheduling/shows/${id}`, { json: body })
  const data = await res.json<{ show: ShowDTO }>()
  return data.show
}

export async function deleteShow(id: string): Promise<void> {
  await api.delete(`api/scheduling/shows/${id}`)
}

export async function reorderShowSegments(showId: string, segmentIds: string[]): Promise<void> {
  await api.put(`api/scheduling/shows/${showId}/segments`, { json: { segmentIds } })
}

export async function updateShowSegmentDuration(
  showId: string,
  segmentId: string,
  durationOverride: number | null,
): Promise<void> {
  await api.patch(`api/scheduling/shows/${showId}/segments/${segmentId}`, {
    json: { durationOverride },
  })
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export async function fetchSegments(filters: SegmentFilters = {}): Promise<SegmentDTO[]> {
  const res = await api.get("api/scheduling/segments", {
    searchParams: toSearchParams(filters as any),
  })
  const data = await res.json<{ segments: SegmentDTO[] }>()
  return data.segments
}

export async function fetchSegment(id: string): Promise<SegmentDTO> {
  const res = await api.get(`api/scheduling/segments/${id}`)
  const data = await res.json<{ segment: SegmentDTO }>()
  return data.segment
}

export async function createSegment(body: CreateSegmentRequest): Promise<SegmentDTO> {
  const res = await api.post("api/scheduling/segments", { json: body })
  const data = await res.json<{ segment: SegmentDTO }>()
  return data.segment
}

export async function updateSegment(id: string, body: UpdateSegmentRequest): Promise<SegmentDTO> {
  const res = await api.put(`api/scheduling/segments/${id}`, { json: body })
  const data = await res.json<{ segment: SegmentDTO }>()
  return data.segment
}

export async function deleteSegment(id: string): Promise<void> {
  await api.delete(`api/scheduling/segments/${id}`)
}

// ---------------------------------------------------------------------------
// Scheduling admins (assignee picker)
// ---------------------------------------------------------------------------

export async function fetchSchedulingAdmins(): Promise<SchedulingAdminUserDTO[]> {
  const res = await api.get("api/scheduling/admins")
  const data = await res.json<{ users: SchedulingAdminUserDTO[] }>()
  return data.users
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function fetchTags(type?: TagType): Promise<TagDTO[]> {
  const searchParams = type ? { type } : undefined
  const res = await api.get("api/scheduling/tags", { searchParams })
  const data = await res.json<{ tags: TagDTO[] }>()
  return data.tags
}

export async function createTag(body: CreateTagRequest): Promise<TagDTO> {
  const res = await api.post("api/scheduling/tags", { json: body })
  const data = await res.json<{ tag: TagDTO }>()
  return data.tag
}

export async function deleteTag(id: string): Promise<void> {
  await api.delete(`api/scheduling/tags/${id}`)
}

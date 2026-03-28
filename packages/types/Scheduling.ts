import type { PluginPreset } from "./PluginPreset"

// ---------------------------------------------------------------------------
// Enum value types
// ---------------------------------------------------------------------------

export type ShowStatus = "draft" | "ready" | "published"
export type SegmentStatus = "draft" | "ready" | "archived"
export type TagType = "segment" | "show"

// ---------------------------------------------------------------------------
// Entity DTOs (API responses)
// ---------------------------------------------------------------------------

export interface ShowDTO {
  id: string
  title: string
  description: string | null
  startTime: string
  endTime: string | null
  roomId: string | null
  status: ShowStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  segments?: ShowSegmentDTO[]
  tags?: TagDTO[]
}

export interface SegmentDTO {
  id: string
  title: string
  description: string | null
  isRecurring: boolean
  /** Approximate duration in minutes (nullable). */
  duration: number | null
  pluginPreset: PluginPreset | null
  status: SegmentStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  tags?: TagDTO[]
  shows?: ShowSummaryDTO[]
}

export interface TagDTO {
  id: string
  name: string
  type: TagType
  createdAt: string
}

export interface ShowSegmentDTO {
  id: string
  segmentId: string
  position: number
  /** Per-show override in minutes; effective = durationOverride ?? segment.duration */
  durationOverride: number | null
  segment: SegmentDTO
}

export interface ShowSummaryDTO {
  id: string
  title: string
  startTime: string
  status: ShowStatus
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export interface CreateShowRequest {
  title: string
  description?: string | null
  startTime: string
  endTime?: string | null
  roomId?: string | null
  status?: ShowStatus
  tagIds?: string[]
}

export interface UpdateShowRequest {
  title?: string
  description?: string | null
  startTime?: string
  endTime?: string | null
  roomId?: string | null
  status?: ShowStatus
  tagIds?: string[]
}

export interface ReorderShowSegmentsRequest {
  segmentIds: string[]
}

export interface CreateSegmentRequest {
  title: string
  description?: string | null
  isRecurring?: boolean
  /** Approximate duration in minutes (optional). */
  duration?: number | null
  pluginPreset?: PluginPreset | null
  status?: SegmentStatus
  tagIds?: string[]
}

export interface UpdateSegmentRequest {
  title?: string
  description?: string | null
  isRecurring?: boolean
  /** Approximate duration in minutes. */
  duration?: number | null
  pluginPreset?: PluginPreset | null
  status?: SegmentStatus
  tagIds?: string[]
}

export interface CreateTagRequest {
  name: string
  type: TagType
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

export interface ShowFilters {
  search?: string
  startDate?: string
  endDate?: string
  status?: ShowStatus
}

export interface SegmentFilters {
  search?: string
  status?: SegmentStatus
  tags?: string[]
  isRecurring?: boolean
  /** "scheduled" = has been in a show, "unscheduled" = never in a show, "all" = no filter */
  scheduled?: "scheduled" | "unscheduled" | "all"
}

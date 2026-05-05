import type { PluginPreset } from "./PluginPreset"

// ---------------------------------------------------------------------------
// Segment room settings (applied on activation in listening room)
// ---------------------------------------------------------------------------

/** Bulk deputy-DJ update when the segment is activated (online users / current deputies). */
export type DeputyBulkAction = "deputize_all" | "dedeputize_all"

/** Keys optional: only present keys overwrite the room when the segment is activated. */
export type SegmentRoomSettingsOverride = {
  deputizeOnJoin?: boolean
  showQueueCount?: boolean
  showQueueTracks?: boolean
  fetchMeta?: boolean
  announceNowPlaying?: boolean
  playbackMode?: "spotify-controlled" | "app-controlled"
  deputyBulkAction?: DeputyBulkAction
}

// ---------------------------------------------------------------------------
// Enum value types
// ---------------------------------------------------------------------------

export type ShowStatus = "draft" | "ready" | "published"
export type SegmentStatus = "draft" | "ready" | "archived"
export type TagType = "segment" | "show"
export type RoomExportStatus = "draft" | "published"

// ---------------------------------------------------------------------------
// Entity DTOs (API responses)
// ---------------------------------------------------------------------------

/** Platform admin user summary for scheduling UI (assignee picker, avatars). */
export interface SchedulingAdminUserDTO {
  id: string
  name: string
  image: string | null
}

export interface RoomExportPlaylistLinkDTO {
  id: string
  title?: string
  url?: string
}

export interface RoomExportPlaylistLinks {
  spotify?: RoomExportPlaylistLinkDTO
  tidal?: RoomExportPlaylistLinkDTO
}

export interface RoomExportDTO {
  id: string
  showId: string
  markdown: string
  status: RoomExportStatus
  playlistLinks: RoomExportPlaylistLinks | null
  createdAt: string
  updatedAt: string
}

/** Persisted playlist row for a show (after publish continue). Empty until then. */
export interface RoomPlaylistTrackDTO {
  id: string
  position: number
  title: string
  playedAt: string | null
  addedAt: string | null
  spotifyTrackId: string | null
  tidalTrackId: string | null
  mediaSourceType: string | null
  mediaSourceTrackId: string | null
}

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
  /** Present when a room export row exists for this show (draft or published). */
  roomExport?: RoomExportDTO | null
  /** Ordered persisted tracks after publish continue; empty until then. */
  roomPlaylistTracks?: RoomPlaylistTrackDTO[]
}

export interface SegmentDTO {
  id: string
  title: string
  description: string | null
  isRecurring: boolean
  /** Approximate duration in minutes (nullable). */
  duration: number | null
  pluginPreset: PluginPreset | null
  roomSettingsOverride: SegmentRoomSettingsOverride | null
  status: SegmentStatus
  createdBy: string
  assignedTo: string | null
  assignee: SchedulingAdminUserDTO | null
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

/** Segment slice stored in room schedule snapshot (Redis + socket). */
export interface RoomScheduleSnapshotSegmentDTO {
  segmentId: string
  position: number
  durationOverride: number | null
  /** Effective minutes: durationOverride ?? segment.duration ?? 0 */
  durationMinutes: number
  segment: {
    title: string
    pluginPreset: PluginPreset | null
  }
}

/**
 * Denormalized show timeline for listening-room clients and Redis-only tools.
 * Postgres remains source of truth; rebuilt on show/segment mutations.
 */
export interface RoomScheduleSnapshotDTO {
  version: 1
  showId: string
  showTitle: string
  startTime: string
  updatedAt: string
  segments: RoomScheduleSnapshotSegmentDTO[]
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

export interface PublishShowFinalizeRequest {
  markdown: string
}

export interface CreateSegmentRequest {
  title: string
  description?: string | null
  isRecurring?: boolean
  /** Approximate duration in minutes (optional). */
  duration?: number | null
  pluginPreset?: PluginPreset | null
  roomSettingsOverride?: SegmentRoomSettingsOverride | null
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
  roomSettingsOverride?: SegmentRoomSettingsOverride | null
  status?: SegmentStatus
  tagIds?: string[]
  /** Set to a platform admin user id, or `null` to clear assignee. */
  assignedTo?: string | null
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
  /** Sort shows by `startTime`. Omitted = descending (newest first), same as pre-sort API. */
  startTimeOrder?: "asc" | "desc"
}

export interface SegmentFilters {
  search?: string
  status?: SegmentStatus
  tags?: string[]
  isRecurring?: boolean
  /** "scheduled" = has been in a show, "unscheduled" = never in a show, "all" = no filter */
  scheduled?: "scheduled" | "unscheduled" | "all"
}

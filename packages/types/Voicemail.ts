export const VOICEMAIL_MAX_DURATION_MS = 120_000
export const VOICEMAIL_MAX_BYTES = 4 * 1024 * 1024
export const VOICEMAIL_RETENTION_DAYS = 120
export const VOICEMAIL_LIST_MAX_SPAN_DAYS = 45
export const VOICEMAIL_LIST_CAP = 200
export const VOICEMAIL_LABEL_MAX_CHARS = 40

export const VOICEMAIL_ALLOWED_CONTENT_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
] as const

export type VoicemailContentType = (typeof VOICEMAIL_ALLOWED_CONTENT_TYPES)[number]

export type VoicemailStatus = "ready" | "hidden"

export interface VoicemailRow {
  id: string
  createdAt: string
  s3Key: string
  contentType: VoicemailContentType | string
  byteSize: number
  durationMs: number
  label: string | null
  status: VoicemailStatus
}

export interface PresignVoicemailRequest {
  contentType: string
  contentLength: number
  durationMs: number
  label?: string | null
}

export interface PresignVoicemailResponse {
  uploadId: string
  url: string
  /** Exact Content-Type the client must send on the PUT (base MIME, no codecs). */
  contentType: string
  /** Exact Content-Length the client must send on the PUT. */
  contentLength: number
}

export interface CompleteVoicemailRequest {
  uploadId: string
}

export interface CompleteVoicemailResponse {
  ok: true
}

export interface VoicemailListItem {
  id: string
  createdAt: string
  durationMs: number
  label: string | null
  /** Presigned GET URL (admin list only). */
  url: string
}

export interface ListVoicemailsRequest {
  from: string
  to: string
}

export interface ListVoicemailsResponse {
  from: string
  to: string
  truncated: boolean
  items: VoicemailListItem[]
}

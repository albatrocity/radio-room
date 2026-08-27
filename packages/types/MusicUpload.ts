export const MUSIC_UPLOAD_MAX_BYTES = 800 * 1024 * 1024

export const MUSIC_UPLOAD_ALLOWED_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".flac",
  ".aiff",
  ".aif",
  ".m4a",
  ".aac",
  ".ogg",
  ".zip",
  ".rar",
  ".7z",
] as const

export const MUSIC_UPLOAD_ACCEPT = [
  ...MUSIC_UPLOAD_ALLOWED_EXTENSIONS,
  "audio/*",
  "application/zip",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
].join(",")

export interface PresignMusicUploadRequest {
  filename: string
  contentType: string
  contentLength: number
}

export interface PresignMusicUploadResponse {
  uploadUrl: string
  key: string
  uploadId: string
  expiresIn: number
}

export interface CompleteMusicUploadRequest {
  uploadId: string
  key: string
}

export interface FailMusicUploadRequest {
  uploadId: string
  key: string
  reason?: string
}

export interface MusicUploadActionResponse {
  ok: true
}

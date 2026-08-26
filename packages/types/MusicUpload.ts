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

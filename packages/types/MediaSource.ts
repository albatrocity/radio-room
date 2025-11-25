import { JobRegistration } from "./JobRegistration"

export type MediaSourceAuthentication = { type: "none" }

export type MediaSource = {
  name: string
  authentication: MediaSourceAuthentication
}

export type MediaSourceData = {
  query: string
  title?: string
  artist?: string
  album?: string
}

export type MediaSourceLifecycleCallbacks = {
  onRegistered?: (params: { name: string }) => void
  onAuthenticationCompleted?: () => void
  onAuthenticationFailed?: (error: Error) => void
  onOnline?: () => void
  onOffline?: () => void
  onError?: (error: Error) => void
  onMediaData?: (data: MediaSourceData) => void
}

export interface MediaSourceAdapterConfig extends MediaSourceLifecycleCallbacks {
  name: string
  authentication: MediaSourceAuthentication
  url: string
  registerJob: (job: JobRegistration) => Promise<JobRegistration>
}

export interface MediaSourceAdapter {
  register: (config: MediaSourceAdapterConfig) => Promise<MediaSource>
  onRoomCreated?: (params: {
    roomId: string
    userId: string
    roomType: "jukebox" | "radio"
    context: import("./AppContext").AppContext
  }) => Promise<void>
  onRoomDeleted?: (params: {
    roomId: string
    context: import("./AppContext").AppContext
  }) => Promise<void>
}

export interface MediaSourceError {
  status: number
  message: string
  reason?: string
}

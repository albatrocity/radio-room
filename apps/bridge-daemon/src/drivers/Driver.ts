export type DriverState = {
  state: "playing" | "paused" | "stopped"
  progressMs: number | null
  durationMs: number | null
  volumePercent?: number | null
  trackId?: string | null
}

export interface Driver {
  readonly source: "youtube" | "tidal" | "local"
  start(): Promise<void>
  stop(): Promise<void>
  healthy(): Promise<boolean>
  load(trackId: string, meta?: { title?: string; artist?: string; album?: string }): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seekTo(ms: number): Promise<void>
  setVolume(percent: number): Promise<void>
  getState(): Promise<DriverState>
  onEnded(cb: (trackId: string) => void): void
  onStateChange(cb: (state: DriverState) => void): void
}

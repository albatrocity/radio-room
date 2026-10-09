import { FALLBACK_TRACKS, fallbackTrackAt } from "./fallbackTracks.js"
import type { TrackMeta } from "./icy.js"
import { formatStreamTitle } from "./icy.js"

export type NowPlayingSource = "fallback" | "bridge" | "manual"

export type NowPlayingSnapshot = TrackMeta & {
  source: NowPlayingSource
  streamTitle: string
  updatedAt: number
}

type Listener = (snapshot: NowPlayingSnapshot) => void

export class NowPlayingController {
  private index = 0
  private source: NowPlayingSource = "fallback"
  private current: TrackMeta = fallbackTrackAt(0)
  private updatedAt = Date.now()
  private rotateTimer: ReturnType<typeof setInterval> | null = null
  private readonly listeners = new Set<Listener>()

  constructor(private readonly rotateMs: number) {}

  start(): void {
    if (this.rotateTimer || this.rotateMs <= 0) return
    this.rotateTimer = setInterval(() => {
      if (this.source !== "fallback") return
      this.index += 1
      this.setTrack(fallbackTrackAt(this.index), "fallback")
    }, this.rotateMs)
    // Unref so rotate timer alone doesn't keep the process alive in tests.
    this.rotateTimer.unref?.()
  }

  stop(): void {
    if (this.rotateTimer) {
      clearInterval(this.rotateTimer)
      this.rotateTimer = null
    }
  }

  getSnapshot(): NowPlayingSnapshot {
    return {
      ...this.current,
      source: this.source,
      streamTitle: formatStreamTitle(this.current),
      updatedAt: this.updatedAt,
    }
  }

  setTrack(meta: TrackMeta, source: NowPlayingSource): void {
    const next: TrackMeta = {
      title: meta.title.trim() || "Untitled",
      artist: meta.artist.trim(),
      album: meta.album.trim(),
    }
    const prev = this.getSnapshot()
    if (
      prev.title === next.title &&
      prev.artist === next.artist &&
      prev.album === next.album &&
      prev.source === source
    ) {
      return
    }
    this.current = next
    this.source = source
    this.updatedAt = Date.now()
    const snap = this.getSnapshot()
    for (const listener of Array.from(this.listeners)) listener(snap)
  }

  /** Resume fallback rotation after a bridge/manual track. */
  resumeFallback(): void {
    this.setTrack(fallbackTrackAt(this.index), "fallback")
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  static defaultTracks(): readonly TrackMeta[] {
    return FALLBACK_TRACKS
  }
}

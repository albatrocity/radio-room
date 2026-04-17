import { describe, it, expect } from "vitest"
import { queueItemFactory, metadataSourceTrackFactory } from "@repo/factories"
import { findQueuedTrack } from "./findQueuedTrack"
import type { MediaSourceSubmission } from "@repo/types"

describe("findQueuedTrack", () => {
  const baseSubmission = (over: Partial<MediaSourceSubmission> = {}): MediaSourceSubmission => ({
    trackId: "sp-1",
    sourceType: "spotify",
    title: "Song",
    artist: "Artist",
    album: "Album",
    ...over,
  })

  it("matches by exact mediaSource type + trackId", () => {
    const track = metadataSourceTrackFactory.build({ id: "sp-1" })
    const item = queueItemFactory.build({
      track,
      mediaSource: { type: "spotify", trackId: "sp-1" },
    })
    const submission = baseSubmission()

    const result = findQueuedTrack({
      queue: [item],
      submission,
      track,
      isRadioRoom: false,
    })
    expect(result).toBe(item)
  })

  it("matches by track.id when mediaSource ids differ (jukebox enrichment edge case)", () => {
    const track = metadataSourceTrackFactory.build({ id: "sp-1", title: "Song" })
    const item = queueItemFactory.build({
      track,
      mediaSource: { type: "spotify", trackId: "legacy-wrong-id" },
    })
    const submission = baseSubmission({ trackId: "sp-1" })

    const result = findQueuedTrack({
      queue: [item],
      submission,
      track,
      isRadioRoom: false,
    })
    expect(result).toBe(item)
  })

  it("does not use track.id fallback in radio rooms (avoids wrong match)", () => {
    const track = metadataSourceTrackFactory.build({ id: "sp-1" })
    const item = queueItemFactory.build({
      track,
      mediaSource: { type: "spotify", trackId: "other" },
    })

    const result = findQueuedTrack({
      queue: [item],
      submission: baseSubmission({ trackId: "sp-1" }),
      track,
      isRadioRoom: true,
    })
    expect(result).toBeUndefined()
  })

  it("returns undefined when nothing matches", () => {
    const track = metadataSourceTrackFactory.build({ id: "x" })
    const item = queueItemFactory.build({
      track,
      mediaSource: { type: "spotify", trackId: "y" },
    })

    const result = findQueuedTrack({
      queue: [item],
      submission: baseSubmission({ trackId: "z" }),
      track: metadataSourceTrackFactory.build({ id: "z" }),
      isRadioRoom: false,
    })
    expect(result).toBeUndefined()
  })
})

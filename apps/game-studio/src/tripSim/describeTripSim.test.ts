import { describe, expect, it } from "vitest"
import type { TripEffect, TripLogEntry } from "@repo/plugin-road-trip/sim"
import { buildSimTimeline, soundEffectLabel } from "./describeTripSim"

describe("soundEffectLabel", () => {
  it("uses the last path segment of an https URL", () => {
    expect(soundEffectLabel("https://cdn.listeningroom.club/assets/maps/sounds/go.mp3")).toBe(
      "go.mp3",
    )
  })

  it("falls back when the URL is not absolute", () => {
    expect(soundEffectLabel("assets/maps/sounds/arrive.wav")).toBe("arrive.wav")
  })
})

describe("buildSimTimeline", () => {
  it("merges log, narrative, and sound in time order", () => {
    const log: TripLogEntry[] = [
      { at: 1_000, mile: 0, kind: "departed" },
      { at: 5_000, mile: 3.7, kind: "site", siteId: "a", name: "Records", phase: "stopped" },
      { at: 4_000, mile: 3, kind: "site", siteId: "a", name: "Records", phase: "revealed" },
    ]
    const effects: { at: number; effect: TripEffect }[] = [
      { at: 1_000, effect: { type: "sound", url: "https://cdn.example/go.mp3" } },
      {
        at: 5_000,
        effect: { type: "narrate", body: "The bins are dusty.", variant: "info" },
      },
      { at: 5_000, effect: { type: "sound", url: "https://cdn.example/arrive.mp3" } },
      { at: 5_000, effect: { type: "sign", variant: "info", title: "EXIT · RECORDS" } },
    ]
    expect(buildSimTimeline(log, effects)).toEqual([
      { kind: "log", at: 1_000, mile: 0, text: "🚐 Departed" },
      {
        kind: "sound",
        at: 1_000,
        url: "https://cdn.example/go.mp3",
        label: "go.mp3",
      },
      {
        kind: "log",
        at: 5_000,
        mile: 3.7,
        text: "🅿️ Pulled off at Records",
      },
      {
        kind: "narrate",
        at: 5_000,
        text: "The bins are dusty.",
        variant: "info",
      },
      {
        kind: "sound",
        at: 5_000,
        url: "https://cdn.example/arrive.mp3",
        label: "arrive.mp3",
      },
    ])
  })
})

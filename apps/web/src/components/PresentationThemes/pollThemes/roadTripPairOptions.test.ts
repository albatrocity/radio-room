import { describe, expect, it } from "vitest"
import type { Poll } from "@repo/types/Poll"
import { roadTripExitOnRight, roadTripPairsOptions } from "./roadTripPairOptions"

function poll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: "poll-1",
    roomId: "room-1",
    question: "Dusty Boots Records in 2 miles: pull off?",
    options: [
      { id: "stop", label: "Pull off" },
      { id: "skip", label: "Keep driving" },
    ],
    status: "open",
    settings: { hideRunningTotal: false },
    createdAt: 0,
    createdBy: "host",
    publishedAt: 0,
    closedAt: null,
    closesAt: null,
    presentation: {
      theme: "road-trip",
      footnote: "No votes = keep driving",
    },
    ...overrides,
  }
}

describe("roadTripPairsOptions", () => {
  it("pairs a two-option pull-off with the exit on the right", () => {
    expect(roadTripPairsOptions(poll())).toBe(true)
    expect(roadTripExitOnRight(poll())).toBe(true)
    expect(
      roadTripPairsOptions(
        poll({ presentation: { theme: "road-trip", footnote: "No votes = pull off" } }),
      ),
    ).toBe(true)
    expect(
      roadTripExitOnRight(
        poll({ presentation: { theme: "road-trip", footnote: "No votes = pull off" } }),
      ),
    ).toBe(true)
  })

  it("pairs a two-option junction", () => {
    expect(
      roadTripPairsOptions(
        poll({
          presentation: {
            theme: "road-trip",
            eyebrow: "JUNCTION",
            footnote: "No votes = stay on the road",
          },
        }),
      ),
    ).toBe(true)
    expect(
      roadTripExitOnRight(
        poll({
          presentation: {
            theme: "road-trip",
            eyebrow: "JUNCTION",
            footnote: "No votes = stay on the road",
          },
        }),
      ),
    ).toBe(false)
  })

  it("stacks an incident choice and any poll with more than two options", () => {
    expect(
      roadTripPairsOptions(
        poll({
          presentation: {
            theme: "road-trip",
            variant: "warning",
            footnote: "No votes = Take the detour",
          },
        }),
      ),
    ).toBe(false)
    expect(
      roadTripPairsOptions(
        poll({
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
            { id: "c", label: "C" },
          ],
          presentation: { theme: "road-trip", eyebrow: "JUNCTION" },
        }),
      ),
    ).toBe(false)
  })
})

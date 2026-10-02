import { describe, expect, it } from "vitest"
import { formatTripTimelineMarkdown } from "./formatTripTimelineMarkdown"
import { MIN, T0, TripSim } from "../trip/testSim"
import { depart } from "../trip/transitions"

describe("formatTripTimelineMarkdown", () => {
  it("renders the Phase 1 playable trip", () => {
    const sim = new TripSim()
    sim.votes["record-store"] = { stop: 3, skip: 5 }
    sim.apply(depart)
    sim.runUntil(T0 + 30 * MIN)
    const markdown = formatTripTimelineMarkdown({
      map: sim.map,
      state: sim.state,
      log: sim.log,
      timeZone: "America/Chicago",
    })
    expect(markdown).toMatchInlineSnapshot(`
      "## Road Trip Timeline

      | | |
      |---|---|
      | Map | Concert Run (rev 1) |
      | Departed / arrived | 3:00 PM / 3:16 PM (target 3:16 PM, on time) |
      | Drive / parked | 12 min / 4 min |
      | Sites | 2 of 3 visited · 1 skipped · 0 mandatory |

      ### Timeline

      | Time | T+ | Mile | Event |
      |---|---|---|---|
      | 3:00 PM | 0:00 | 0.0 | 🚐 Departed |
      | 3:03 PM | 0:03 | 3.3 | 📀 Dusty Boots Records: skipped (5–3) |
      | 3:08 PM | 0:08 | 8.0 | 🍎 Farmers Market: stopped (no votes, default) |
      | 3:16 PM | 0:16 | 12.0 | 🏁 Arrived |

      ### Sites visited

      - 🍎 **Farmers Market** — A roadside stand with honey, peaches, and hand-lettered signs.
      - 🎸 **The Concert** — Lights, sound check, and a crowd waiting."
    `)
  })

  it("renders a trip that never departed", () => {
    const sim = new TripSim()
    const markdown = formatTripTimelineMarkdown({ map: sim.map, state: sim.state, log: [] })
    expect(markdown).toContain("| Departed / arrived | Not departed |")
    expect(markdown).toContain("| Sites | 0 of 3 visited · 0 skipped · 0 mandatory |")
  })
})

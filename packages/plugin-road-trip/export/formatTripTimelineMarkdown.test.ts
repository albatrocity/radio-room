import { describe, expect, it } from "vitest"
import { SAMPLE_TRIP_MAP, type TripMapInput } from "@repo/road-trip-map"
import { formatTripTimelineMarkdown } from "./formatTripTimelineMarkdown"
import { MIN, T0, TripSim } from "../trip/testSim"
import { installPart } from "../trip/incidents"
import { depart } from "../trip/transitions"

/** The Phase 2 sample trip: no Mechanic and no scripted events. */
function baseline(): TripMapInput {
  const map = structuredClone(SAMPLE_TRIP_MAP)
  map.sites = map.sites.filter((site) => !site.services?.mechanic)
  delete map.scriptedEvents
  return map
}

describe("formatTripTimelineMarkdown", () => {
  it("renders the sample trip with its gas stop and Travelers", () => {
    const sim = new TripSim(baseline())
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
      | Departed / arrived | 3:00 PM / 3:18 PM (target 3:18 PM, on time) |
      | Drive / parked | 12 min / 6 min |
      | Sites | 3 of 4 visited · 1 skipped · 0 mandatory |
      | Money | 108 coins · 1 gas stop |

      ### Timeline

      | Time | T+ | Mile | Event |
      |---|---|---|---|
      | 3:00 PM | 0:00 | 0.0 | 🚐 Departed |
      | 3:03 PM | 0:03 | 3.3 | 📀 Dusty Boots Records: skipped (5–3) |
      | 3:05 PM | 0:05 | 5.7 | ⛽ Low fuel (2.3 gal) |
      | 3:06 PM | 0:06 | 6.0 | ⛽ Gas 'n' Go: stopped (no votes, default) |
      | 3:06 PM | 0:06 | 6.0 | ⛽ Gas 'n' Go: 108 coins from 2 travelers, filled 13.5 gal |
      | 3:10 PM | 0:10 | 8.0 | 🍎 Farmers Market: stopped (no votes, default) |
      | 3:17 PM | 0:17 | 11.7 | ⛽ Low fuel (2.3 gal) |
      | 3:18 PM | 0:18 | 12.0 | 🏁 Arrived |

      ### Travelers

      | Listener | Coins paid | Parts |
      |---|---|---|
      | ada | 98 | — |
      | bo | 10 | — |

      ### Sites visited

      - ⛽ **Gas 'n' Go** — Two pumps, a humming ice machine, and a hand-lettered price sign.
      - 🍎 **Farmers Market** — A roadside stand with honey, peaches, and hand-lettered signs.
      - 🎸 **The Concert** — Lights, sound check, and a crowd waiting."
    `)
  })

  it("renders incidents, AAA, and installed parts", () => {
    const sim = new TripSim(SAMPLE_TRIP_MAP)
    sim.votes["record-store"] = { stop: 3, skip: 5 }
    sim.apply(installPart("aaa-card", { userId: "bo", name: "bo" }))
    sim.apply(depart)
    sim.runUntil(T0 + 30 * MIN)
    const markdown = formatTripTimelineMarkdown({
      map: sim.map,
      state: sim.state,
      log: sim.log,
      timeZone: "America/Chicago",
    })
    expect(markdown).toContain("| Incidents | 1 |")
    expect(markdown).toContain("| 3:15 PM | 0:15 | 9.0 | 🛞 Blown tire (scripted) |")
    expect(markdown).toContain("💳 bo's AAA card covered it")
    expect(markdown).toContain("🛞 Blown tire cleared")
    expect(markdown).toContain("💳 bo installed AAA Card")
    expect(markdown).toContain("| bo | 10 | AAA Card |")
  })

  it("renders a trip that never departed", () => {
    const sim = new TripSim(baseline())
    const markdown = formatTripTimelineMarkdown({ map: sim.map, state: sim.state, log: [] })
    expect(markdown).toContain("| Departed / arrived | Not departed |")
    expect(markdown).toContain("| Sites | 0 of 4 visited · 0 skipped · 0 mandatory |")
    expect(markdown).not.toContain("| Money |")
    expect(markdown).not.toContain("### Travelers")
  })
})

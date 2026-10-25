import { describe, expect, it } from "vitest"
import { describeIncident } from "./describeEvent"

describe("describeIncident", () => {
  it("describes a cleared incident that filled the tank as the refuel", () => {
    expect(
      describeIncident({
        kind: "incident",
        incident: "out-of-gas",
        name: "Out of gas",
        icon: "⛽",
        source: "fuel",
        step: "cleared",
        refueled: true,
        at: 0,
        mile: 0,
      }),
    ).toBe("⛽ Refuelled by the fuel truck")
  })

  it("keeps the generic cleared line for other incidents", () => {
    expect(
      describeIncident({
        kind: "incident",
        incident: "blown-tire",
        source: "scripted",
        step: "cleared",
        at: 0,
        mile: 0,
      }),
    ).toBe("🛞 Blown tire cleared")
  })

  it("uses the logged name and icon of a custom event", () => {
    expect(
      describeIncident({
        kind: "incident",
        incident: "nails",
        name: "Roofing nails",
        icon: "📌",
        source: "scripted",
        step: "immune",
        partId: "road-grip-tires",
        at: 0,
        mile: 0,
      }),
    ).toBe("📌 Roofing nails shrugged off by Road-Grip Tires")
  })
})

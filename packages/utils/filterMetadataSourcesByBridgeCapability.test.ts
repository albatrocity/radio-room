import { describe, expect, it } from "vitest"
import { filterMetadataSourcesByBridgeCapability } from "./filterMetadataSourcesByBridgeCapability"

const all = ["spotify", "tidal", "youtube", "local"]

describe("filterMetadataSourcesByBridgeCapability", () => {
  it("drops local when daemon is offline", () => {
    expect(
      filterMetadataSourcesByBridgeCapability({
        metadataSourceIds: all,
        bridgeConnected: false,
        capabilitiesKnown: false,
        availableServices: [],
      }),
    ).toEqual(["spotify", "tidal", "youtube"])
  })

  it("keeps local when connected but CAPABILITIES not yet known", () => {
    expect(
      filterMetadataSourcesByBridgeCapability({
        metadataSourceIds: all,
        bridgeConnected: true,
        capabilitiesKnown: false,
        availableServices: [],
      }),
    ).toEqual(all)
  })

  it("intersects tied sources when CAPABILITIES are known", () => {
    expect(
      filterMetadataSourcesByBridgeCapability({
        metadataSourceIds: all,
        bridgeConnected: true,
        capabilitiesKnown: true,
        availableServices: ["tidal", "local"],
      }),
    ).toEqual(["spotify", "tidal", "local"])
  })

  it("hides youtube when daemon disables it", () => {
    expect(
      filterMetadataSourcesByBridgeCapability({
        metadataSourceIds: all,
        bridgeConnected: true,
        capabilitiesKnown: true,
        availableServices: ["tidal"],
      }),
    ).toEqual(["spotify", "tidal"])
  })

  it("keeps spotify even when CAPABILITIES is empty", () => {
    expect(
      filterMetadataSourcesByBridgeCapability({
        metadataSourceIds: all,
        bridgeConnected: true,
        capabilitiesKnown: true,
        availableServices: [],
      }),
    ).toEqual(["spotify"])
  })
})

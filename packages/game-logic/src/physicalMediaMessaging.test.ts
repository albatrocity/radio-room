import { describe, expect, it } from "vitest"
import {
  albumTitleFromItemName,
  brokenMediaConvertMetadata,
  brokenMediaOriginHint,
  inventoryItemDescription,
  isBrokenMediaShortId,
  STALE_PHYSICAL_MEDIA_EMPTY,
} from "./physicalMediaMessaging"

describe("isBrokenMediaShortId", () => {
  it("recognizes broken Inventory SKUs", () => {
    expect(isBrokenMediaShortId("scratched-cd")).toBe(true)
    expect(isBrokenMediaShortId("dusty-record")).toBe(true)
    expect(isBrokenMediaShortId("tangled-tape")).toBe(true)
  })

  it("rejects other shortIds", () => {
    expect(isBrokenMediaShortId("boost-pedal")).toBe(false)
    expect(isBrokenMediaShortId(undefined)).toBe(false)
  })
})

describe("albumTitleFromItemName", () => {
  it("strips format prefixes", () => {
    expect(albumTitleFromItemName("LP: Loveless")).toBe("Loveless")
    expect(albumTitleFromItemName("Cassette: Mix Tape")).toBe("Mix Tape")
    expect(albumTitleFromItemName("CD: Kid A")).toBe("Kid A")
    expect(albumTitleFromItemName("45: Come as You Are")).toBe("Come as You Are")
  })

  it("passes through names without a format prefix", () => {
    expect(albumTitleFromItemName("Kid A")).toBe("Kid A")
  })
})

describe("brokenMediaConvertMetadata", () => {
  it("stores origin id and stripped album title", () => {
    expect(
      brokenMediaConvertMetadata({
        originDefinitionId: "item-shops:pm-kid-a",
        originRecordName: "CD: Kid A",
      }),
    ).toEqual({
      mediaOrigin: "item-shops:pm-kid-a",
      mediaOriginTitle: "Kid A",
    })
  })
})

describe("brokenMediaOriginHint", () => {
  it("builds the in-character hint", () => {
    expect(brokenMediaOriginHint("Kid A")).toBe(
      "This looks like Kid A, but it's hard to tell",
    )
  })
})

describe("inventoryItemDescription", () => {
  it("returns description alone when there is no hint", () => {
    expect(inventoryItemDescription("A CD from the Record Store.", undefined)).toBe(
      "A CD from the Record Store.",
    )
  })

  it("joins description and origin hint", () => {
    expect(
      inventoryItemDescription(
        "Useless without a cleaner.",
        "This looks like Kid A, but it's hard to tell",
      ),
    ).toBe("Useless without a cleaner. This looks like Kid A, but it's hard to tell")
  })

  it("returns hint alone when description is missing", () => {
    expect(
      inventoryItemDescription(undefined, "This looks like Kid A, but it's hard to tell"),
    ).toBe("This looks like Kid A, but it's hard to tell")
  })
})

describe("STALE_PHYSICAL_MEDIA_EMPTY", () => {
  it("is the CatalogBrowse worn-out empty copy", () => {
    expect(STALE_PHYSICAL_MEDIA_EMPTY).toBe("This copy wore out.")
  })
})

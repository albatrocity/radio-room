import { describe, expect, it } from "vitest"
import { pierceAnonymousSystemContent } from "./pierceAnonymousSystemContent"
import {
  presentedUsername,
  showXRayPierceIcon,
  wasPresentedIdentityMasked,
} from "./presentedUsername"
import { PIERCE_INDICATOR_ICON } from "./pierceIndicator"

describe("presentedUsername", () => {
  it("exports the pierce indicator icon name", () => {
    expect(PIERCE_INDICATOR_ICON).toBe("ScanSearch")
  })

  it("returns trueUsername when not masked", () => {
    expect(presentedUsername({ trueUsername: "Alice", viewerPierces: false })).toBe("Alice")
  })

  it("returns trueUsername when viewer pierces even if masked", () => {
    expect(
      presentedUsername({
        trueUsername: "Alice",
        maskedUsername: "Somebody",
        viewerPierces: true,
      }),
    ).toBe("Alice")
  })

  it("returns maskedUsername when present and viewer does not pierce", () => {
    expect(
      presentedUsername({
        trueUsername: "Alice",
        maskedUsername: "Somebody",
        viewerPierces: false,
      }),
    ).toBe("Somebody")
  })
})

describe("showXRayPierceIcon", () => {
  it("returns true when the viewer pierces a masked name", () => {
    expect(
      showXRayPierceIcon({
        trueUsername: "Alice",
        maskedUsername: "Somebody",
        viewerPierces: true,
      }),
    ).toBe(true)
  })

  it("returns false when the viewer does not pierce", () => {
    expect(
      showXRayPierceIcon({
        trueUsername: "Alice",
        maskedUsername: "Somebody",
        viewerPierces: false,
      }),
    ).toBe(false)
  })

  it("returns false when the baked name already matches the true name", () => {
    expect(
      showXRayPierceIcon({
        trueUsername: "Alice",
        maskedUsername: "Alice",
        viewerPierces: true,
      }),
    ).toBe(false)
  })
})

describe("wasPresentedIdentityMasked", () => {
  it("detects differing true and masked usernames", () => {
    expect(
      wasPresentedIdentityMasked({
        trueUsername: "Alice",
        maskedUsername: "Somebody",
      }),
    ).toBe(true)
  })

  it("returns false for empty or missing masks", () => {
    expect(
      wasPresentedIdentityMasked({
        trueUsername: "Alice",
        maskedUsername: "",
      }),
    ).toBe(false)
    expect(
      wasPresentedIdentityMasked({
        trueUsername: "Alice",
      }),
    ).toBe(false)
  })
})

describe("pierceAnonymousSystemContent", () => {
  it("leaves content unchanged without pierce", () => {
    expect(pierceAnonymousSystemContent("Somebody stole an item", ["u1"], false)).toBe(
      "Somebody stole an item",
    )
  })

  it("substitutes Somebody in order when piercing", () => {
    // displayNameForUserId falls back to the userId when unknown in unit tests
    expect(pierceAnonymousSystemContent("Somebody stole from Somebody!", ["u1", "u2"], true)).toBe(
      "u1 stole from u2!",
    )
  })

  it("substitutes custom maskedLabel when piercing", () => {
    expect(
      pierceAnonymousSystemContent(
        "Somebody stole an item",
        ["u1"],
        true,
        () => "Alice",
        "Somebody",
      ),
    ).toBe("Alice stole an item")
  })
})

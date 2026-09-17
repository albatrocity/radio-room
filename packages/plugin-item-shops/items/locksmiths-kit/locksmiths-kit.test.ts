import { describe, expect, test } from "vitest"
import { locksmithsKit } from "./index"
import { lockPick } from "../lock-pick"

describe("locksmithsKit", () => {
  test("registers expected catalog fields", () => {
    expect(locksmithsKit.shortId).toBe("locksmiths-kit")
    expect(locksmithsKit.catalogEntry.definition.name).toBe("Locksmith's Kit")
    expect(locksmithsKit.catalogEntry.definition.rarity).toBe("legendary")
    expect(locksmithsKit.catalogEntry.definition.coinValue).toBe(100)
    expect(locksmithsKit.catalogEntry.definition.maxStack).toBe(2)
    expect(locksmithsKit.catalogEntry.definition.icon).toBe("KeyRound")
    expect(locksmithsKit.catalogEntry.definition.requiresTarget).toBe("storedArtifact")
    expect(typeof locksmithsKit.use).toBe("function")
  })

  test("uses higher success odds than lock pick", () => {
    expect(lockPick.catalogEntry.definition.coinValue).toBe(50)
    expect(lockPick.catalogEntry.definition.rarity).toBe("rare")
    expect(lockPick.catalogEntry.definition.maxStack).toBe(3)
    expect(lockPick.catalogEntry.definition.icon).toBe("LockKeyholeOpen")
  })
})

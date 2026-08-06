import { describe, expect, it } from "vitest"
import { getConfigSchema } from "./schema"

describe("playlist-bingo config schema", () => {
  it("declares importCriteria as a private-field configImport (scheduler dry-run path)", () => {
    const actions = getConfigSchema().layout.filter(
      (el): el is Extract<(typeof el), { type: "action" }> =>
        typeof el === "object" && (el as { type?: string }).type === "action",
    )
    const importAction = actions.find((a) => a.action === "importCriteria")
    expect(importAction?.configImport).toMatchObject({
      targetField: "criteria",
      modes: ["append", "replace"],
      sourceParam: "rawText",
      itemNoun: "criteria",
    })
    expect(importAction?.configImport?.helpText).toMatch(/year 1977/)
    expect(getConfigSchema().fieldMeta.criteria.scope).toBe("private")
  })
})

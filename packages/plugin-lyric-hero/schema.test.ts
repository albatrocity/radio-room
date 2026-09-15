import { describe, expect, it } from "vitest"
import { getComponentSchema, getConfigSchema } from "./schema"

describe("lyric-hero config schema", () => {
  it("declares importPhrases as a private-field configImport (scheduler dry-run path)", () => {
    const actions = getConfigSchema().layout.filter(
      (el): el is Extract<(typeof el), { type: "action" }> =>
        typeof el === "object" && (el as { type?: string }).type === "action",
    )
    const importAction = actions.find((a) => a.action === "importPhrases")
    expect(importAction?.configImport).toMatchObject({
      targetField: "phrases",
      modes: ["append", "replace"],
      sourceParam: "rawText",
      itemNoun: "phrases",
    })
    expect(importAction?.configImport?.helpText).toMatch(/one lyric phrase per line/i)
    expect(getConfigSchema().fieldMeta.phrases.scope).toBe("private")
    expect(getConfigSchema().quickAccess).toContain("importPhrases")
  })

  it("exposes playSoundEffects (default on) in the config form", () => {
    expect(getConfigSchema().layout).toContain("playSoundEffects")
    expect(getConfigSchema().fieldMeta.playSoundEffects).toMatchObject({
      type: "boolean",
      label: "Play sound effects",
    })
  })

  it("exposes auto-advance settings gated on the toggle", () => {
    expect(getConfigSchema().layout).toContain("autoAdvance")
    expect(getConfigSchema().layout).toContain("autoAdvanceDelaySec")
    expect(getConfigSchema().fieldMeta.autoAdvance).toMatchObject({
      type: "boolean",
      label: "Auto-advance after phrase completes",
    })
    expect(getConfigSchema().fieldMeta.autoAdvanceDelaySec.showWhen).toEqual(
      expect.arrayContaining([
        { field: "enabled", value: true },
        { field: "autoAdvance", value: true },
      ]),
    )
  })

  it("includes autoAdvanceDeadline in the component store", () => {
    expect(getComponentSchema().storeKeys).toContain("autoAdvanceDeadline")
  })

  it("declares optional hint on each phrase row", () => {
    const phrases = getConfigSchema().fieldMeta.phrases
    expect(phrases.type).toBe("object-array")
    if (phrases.type !== "object-array") return
    expect(phrases.itemFields?.map((f) => f.name)).toEqual(["text", "hint"])
    expect(phrases.itemFields?.find((f) => f.name === "hint")?.meta).toMatchObject({
      type: "string",
      label: "Hint",
    })
  })
})

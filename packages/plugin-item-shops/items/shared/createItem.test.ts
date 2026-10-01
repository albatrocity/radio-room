import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { ITEM_MODEL_FILENAME_PATTERN } from "@repo/types"
import { ITEM_CATALOG } from "../index"
import { createItem, type ItemDefinitionInput } from "./types"

const itemsDir = dirname(dirname(fileURLToPath(import.meta.url)))

const baseDefinition: ItemDefinitionInput = {
  name: "Test Item",
  description: "Short line.",
  icon: "Beer",
  stackable: false,
  maxStack: 1,
  tradeable: true,
  consumable: false,
}

describe("createItem model and lore", () => {
  test("passes model and lore through to the catalog definition", () => {
    const item = createItem({
      shortId: "test-item",
      definition: { ...baseDefinition, model: "model.glb", lore: "Long story." },
    })
    expect(item.catalogEntry.definition.model).toBe("model.glb")
    expect(item.catalogEntry.definition.lore).toBe("Long story.")
  })

  test("opts into the default detail view when model is set", () => {
    const item = createItem({
      shortId: "test-item",
      definition: { ...baseDefinition, model: "model.glb" },
    })
    expect(item.catalogEntry.definition.detailView).toEqual({ layout: "default" })
  })

  test("opts into the default detail view when lore is set", () => {
    const item = createItem({
      shortId: "test-item",
      definition: { ...baseDefinition, lore: "Long story." },
    })
    expect(item.catalogEntry.definition.detailView).toEqual({ layout: "default" })
  })

  test("ignores whitespace-only lore", () => {
    const item = createItem({
      shortId: "test-item",
      definition: { ...baseDefinition, lore: "   " },
    })
    expect(item.catalogEntry.definition.detailView).toBeUndefined()
  })

  test("keeps an explicit detailView", () => {
    const item = createItem({
      shortId: "test-item",
      definition: {
        ...baseDefinition,
        lore: "Long story.",
        detailView: { layout: "punchCard", actionLabel: "Ledger" },
      },
    })
    expect(item.catalogEntry.definition.detailView).toEqual({
      layout: "punchCard",
      actionLabel: "Ledger",
    })
  })

  test("leaves detailView unset without model or lore", () => {
    const item = createItem({ shortId: "test-item", definition: baseDefinition })
    expect(item.catalogEntry.definition.detailView).toBeUndefined()
  })
})

describe("authored item models", () => {
  test("every model is a bare GLB filename that exists in its item folder", () => {
    const problems: string[] = []
    for (const { definition } of ITEM_CATALOG) {
      const { shortId, model } = definition
      if (model == null) continue
      if (!ITEM_MODEL_FILENAME_PATTERN.test(model)) {
        problems.push(`${shortId}: "${model}" is not a bare .glb filename`)
      } else if (!existsSync(join(itemsDir, shortId, model))) {
        problems.push(`${shortId}: items/${shortId}/${model} is missing`)
      }
    }
    expect(problems).toEqual([])
  })
})

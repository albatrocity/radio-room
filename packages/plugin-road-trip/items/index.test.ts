import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { ITEM_MODEL_FILENAME_PATTERN } from "@repo/types"
import { ITEM_MODELS, ROAD_TRIP_ITEM_DEFINITIONS } from "./index"

const itemsDir = dirname(fileURLToPath(import.meta.url))
const itemShopsItemsDir = join(itemsDir, "../../plugin-item-shops/items")

describe("road-trip item models (ADR 0199)", () => {
  it("every model is a bare GLB filename that exists in its item folder", () => {
    const problems: string[] = []
    for (const [shortId, model] of Object.entries(ITEM_MODELS)) {
      if (!model) continue
      if (!ROAD_TRIP_ITEM_DEFINITIONS.some((d) => d.shortId === shortId)) {
        problems.push(`${shortId}: not a road-trip item`)
      } else if (!ITEM_MODEL_FILENAME_PATTERN.test(model)) {
        problems.push(`${shortId}: "${model}" is not a bare .glb filename`)
      } else if (!existsSync(join(itemsDir, shortId, model))) {
        problems.push(`${shortId}: items/${shortId}/${model} is missing`)
      }
    }
    expect(problems).toEqual([])
  })

  it("modeled items open the default detail view", () => {
    for (const definition of ROAD_TRIP_ITEM_DEFINITIONS) {
      if (definition.model) expect(definition.detailView).toEqual({ layout: "default" })
      else expect(definition.detailView).toBeUndefined()
    }
  })

  it("shortIds never collide with Item Shops folders in the shared assets/items/ prefix", () => {
    const itemShopsIds = new Set(
      readdirSync(itemShopsItemsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    )
    const collisions = ROAD_TRIP_ITEM_DEFINITIONS.map((d) => d.shortId).filter((id) =>
      itemShopsIds.has(id),
    )
    expect(collisions).toEqual([])
  })
})

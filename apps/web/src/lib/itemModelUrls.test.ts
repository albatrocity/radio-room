import { describe, expect, it } from "vitest"
import { resolveItemModelUrl } from "./itemModelUrls"

describe("resolveItemModelUrl", () => {
  it("builds the asset CDN path from shortId and filename", () => {
    expect(resolveItemModelUrl("cold-beer", "model.glb")).toBe(
      "https://cdn.listeningroom.club/assets/items/cold-beer/model.glb",
    )
  })

  it("honors a configured base URL without doubling slashes", () => {
    expect(resolveItemModelUrl("cold-beer", "model.glb", "https://cdn.example/")).toBe(
      "https://cdn.example/assets/items/cold-beer/model.glb",
    )
  })

  it.each(["../model.glb", "foo/bar.glb", "model.gltf", ".glb", "", "  "])(
    "rejects %j",
    (model) => {
      expect(resolveItemModelUrl("cold-beer", model)).toBeUndefined()
    },
  )

  it("needs both a shortId and a model", () => {
    expect(resolveItemModelUrl(undefined, "model.glb")).toBeUndefined()
    expect(resolveItemModelUrl("cold-beer", undefined)).toBeUndefined()
  })
})

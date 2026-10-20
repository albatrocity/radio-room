import { describe, expect, it } from "vitest"
import { pluginFactories } from "@repo/plugins"
import { buildBridgePluginSchemas } from "./pluginSchemas.js"

const byName = (name: string) => buildBridgePluginSchemas().find((schema) => schema.name === name)

describe("buildBridgePluginSchemas", () => {
  it("lists every registered plugin with its own config schema", () => {
    const schemas = buildBridgePluginSchemas()

    expect(schemas).toHaveLength(pluginFactories.length)
    expect(byName("the-fed")?.configSchema).toBeDefined()
  })

  it("serves component schemas from the plugin packages", () => {
    const lyricHero = byName("lyric-hero")?.componentSchema
    const volume = byName("volume-manager")?.componentSchema

    expect(lyricHero?.components.map((c) => c.type)).toContain("lyric-hero-card")
    expect(volume?.storeKeys).toContain("volume")
  })

  it("enables previewed plugins by default and leaves the rest at their package default", () => {
    expect(byName("lyric-hero")?.defaultConfig?.enabled).toBe(true)
    expect(byName("the-fed")?.defaultConfig?.enabled).toBe(false)
  })

  it("drops a plugin when its factory is not registered", () => {
    const schemas = buildBridgePluginSchemas(
      pluginFactories.filter((factory) => factory().name !== "lyric-hero"),
    )

    expect(schemas.map((schema) => schema.name)).not.toContain("lyric-hero")
    expect(schemas).toHaveLength(pluginFactories.length - 1)
  })
})

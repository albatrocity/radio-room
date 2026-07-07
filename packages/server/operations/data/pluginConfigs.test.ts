import { describe, it, expect, beforeEach } from "vitest"
import type { AppContext } from "@repo/types"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import {
  getAllPluginConfigs,
  getAllMergedPluginConfigs,
  getMergedPluginConfig,
  getPluginConfig,
  getPluginPrivateConfig,
  setPluginConfig,
  deleteAllPluginConfigs,
} from "./pluginConfigs"

const ROOM = "room-1"
const PLUGIN = "quiz"

/**
 * Fake registry declaring `questions` as a PRIVATE field. Mirrors what a plugin's
 * getConfigSchema() returns (only the shape getPrivateFieldNames reads).
 */
function makeContext(client: MemoryRedisClient): AppContext {
  return {
    redis: {
      pubClient: client as unknown as AppContext["redis"]["pubClient"],
      subClient: client as unknown as AppContext["redis"]["subClient"],
    },
    pluginRegistry: {
      getPluginSchema: (name: string) =>
        name === PLUGIN
          ? {
              configSchema: {
                fieldMeta: {
                  mode: { scope: "public" },
                  questions: { scope: "private" },
                },
              },
            }
          : null,
    },
  } as unknown as AppContext
}

describe("pluginConfigs split storage (ADR 0068)", () => {
  let client: MemoryRedisClient
  let context: AppContext

  beforeEach(() => {
    client = new MemoryRedisClient()
    context = makeContext(client)
  })

  it("routes private fields to :private and public fields to :config", async () => {
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: PLUGIN,
      config: { mode: "classic", questions: [{ text: "Q1", acceptedAnswers: ["A1"] }] },
    })

    const publicRaw = await client.get(`room:${ROOM}:plugins:${PLUGIN}:config`)
    const privateRaw = await client.get(`room:${ROOM}:plugins:${PLUGIN}:private`)

    expect(JSON.parse(publicRaw!)).toEqual({ mode: "classic" })
    expect(JSON.parse(privateRaw!)).toEqual({
      questions: [{ text: "Q1", acceptedAnswers: ["A1"] }],
    })
  })

  it("never exposes private fields via the broadcast-safe reads", async () => {
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: PLUGIN,
      config: { mode: "classic", questions: [{ text: "Q1", acceptedAnswers: ["A1"] }] },
    })

    const pub = await getPluginConfig({ context, roomId: ROOM, pluginName: PLUGIN })
    const all = await getAllPluginConfigs({ context, roomId: ROOM })

    expect(pub).toEqual({ mode: "classic" })
    expect(pub).not.toHaveProperty("questions")
    expect(all[PLUGIN]).toEqual({ mode: "classic" })
    expect(all[PLUGIN]).not.toHaveProperty("questions")
    // The private view and merged view (server-only) still have the secret.
    expect(await getPluginPrivateConfig({ context, roomId: ROOM, pluginName: PLUGIN })).toEqual({
      questions: [{ text: "Q1", acceptedAnswers: ["A1"] }],
    })
    expect(await getMergedPluginConfig({ context, roomId: ROOM, pluginName: PLUGIN })).toEqual({
      mode: "classic",
      questions: [{ text: "Q1", acceptedAnswers: ["A1"] }],
    })
  })

  it("preserves stored private fields on a partial save that omits them", async () => {
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: PLUGIN,
      config: { mode: "classic", questions: [{ text: "Q1", acceptedAnswers: ["A1"] }] },
    })

    // Admin who never fetched private values saves only public fields.
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: PLUGIN,
      config: { mode: "speed" },
    })

    const merged = await getMergedPluginConfig({ context, roomId: ROOM, pluginName: PLUGIN })
    expect(merged).toEqual({
      mode: "speed",
      questions: [{ text: "Q1", acceptedAnswers: ["A1"] }],
    })
  })

  it("updates private fields when present in the save", async () => {
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: PLUGIN,
      config: { mode: "classic", questions: [{ text: "Q1", acceptedAnswers: ["A1"] }] },
    })
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: PLUGIN,
      config: { mode: "classic", questions: [] },
    })

    expect(await getPluginPrivateConfig({ context, roomId: ROOM, pluginName: PLUGIN })).toEqual({
      questions: [],
    })
  })

  it("stores all fields publicly when the plugin declares no private fields", async () => {
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: "no-schema-plugin",
      config: { anything: true },
    })

    expect(
      await getPluginConfig({ context, roomId: ROOM, pluginName: "no-schema-plugin" }),
    ).toEqual({ anything: true })
    expect(
      await getPluginPrivateConfig({ context, roomId: ROOM, pluginName: "no-schema-plugin" }),
    ).toBeNull()
  })

  it("deletes both public and private keys", async () => {
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: PLUGIN,
      config: { mode: "classic", questions: [{ text: "Q1", acceptedAnswers: ["A1"] }] },
    })

    await deleteAllPluginConfigs({ context, roomId: ROOM })

    expect(await client.get(`room:${ROOM}:plugins:${PLUGIN}:config`)).toBeNull()
    expect(await client.get(`room:${ROOM}:plugins:${PLUGIN}:private`)).toBeNull()
  })

  it("getAllMergedPluginConfigs includes private fields (admin fetch); getAllPluginConfigs does not", async () => {
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: PLUGIN,
      config: { mode: "classic", questions: [{ text: "Q1", acceptedAnswers: ["A1"] }] },
    })

    const broadcastView = await getAllPluginConfigs({ context, roomId: ROOM })
    const adminView = await getAllMergedPluginConfigs({ context, roomId: ROOM })

    expect(broadcastView[PLUGIN]).toEqual({ mode: "classic" })
    expect(broadcastView[PLUGIN]).not.toHaveProperty("questions")
    expect(adminView[PLUGIN]).toEqual({
      mode: "classic",
      questions: [{ text: "Q1", acceptedAnswers: ["A1"] }],
    })
  })

  it("clears both keys when config is set to null", async () => {
    await setPluginConfig({
      context,
      roomId: ROOM,
      pluginName: PLUGIN,
      config: { mode: "classic", questions: [{ text: "Q1", acceptedAnswers: ["A1"] }] },
    })

    await setPluginConfig({ context, roomId: ROOM, pluginName: PLUGIN, config: null })

    expect(await getMergedPluginConfig({ context, roomId: ROOM, pluginName: PLUGIN })).toBeNull()
  })
})

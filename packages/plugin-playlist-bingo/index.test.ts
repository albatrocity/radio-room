import { describe, expect, it, vi, beforeEach } from "vitest"
import { PlaylistBingoPlugin } from "./index"
import { BINGO_FILLABLE_CELLS, defaultPlaylistBingoConfig } from "./types"
import { queueItemFactory } from "@repo/factories"
import { metadataSourceTrackFactory } from "@repo/factories"

function makeCriteria(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    type: "titleContains" as const,
    value: `track-${i}`,
    durationMs: 0,
  }))
}

function createMockContext() {
  const cards = new Map<string, string>()
  const winners = new Map<string, string>()
  let round: string | null = null
  const storage = {
    get: vi.fn(async (key: string) => (key === "round" ? round : null)),
    set: vi.fn(async (key: string, value: string) => {
      if (key === "round") round = value
    }),
    del: vi.fn(async (key: string) => {
      if (key === "round") round = null
      if (key === "cards") cards.clear()
      if (key === "winners") winners.clear()
    }),
    hget: vi.fn(async (_key: string, field: string) => cards.get(field) ?? null),
    hset: vi.fn(async (key: string, field: string, value: string) => {
      if (key === "cards") cards.set(field, value)
      if (key === "winners") winners.set(field, value)
    }),
    hgetall: vi.fn(async (key: string) => {
      if (key === "cards") return Object.fromEntries(cards)
      if (key === "winners") return Object.fromEntries(winners)
      return {}
    }),
  }

  const api = {
    isRoomAdmin: vi.fn(async () => true),
    getUsers: vi.fn(async () => [{ userId: "u1", username: "Alice" }]),
    getUsersByIds: vi.fn(async (ids: string[]) =>
      ids.map((userId) => ({ userId, username: userId === "u1" ? "Alice" : userId })),
    ),
    sendSystemMessage: vi.fn(async () => {}),
    queueSoundEffect: vi.fn(async () => {}),
    queueScreenEffect: vi.fn(async () => {}),
    setPluginConfig: vi.fn(async () => {}),
    emit: vi.fn(async () => {}),
  }

  const game = {
    getActiveSession: vi.fn(async () => ({ id: "session-1" })),
    addScore: vi.fn(async () => 10),
  }

  const personas = {
    registerPersonas: vi.fn(async () => {}),
    unregisterPersonas: vi.fn(async () => {}),
    assign: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    getUsersWithPersona: vi.fn(async () => [] as string[]),
  }

  return {
    roomId: "room-1",
    storage,
    api,
    game,
    inventory: {} as any,
    personas,
    cards,
    _setRound: (v: string | null) => {
      round = v
    },
  }
}

describe("PlaylistBingoPlugin", () => {
  let plugin: PlaylistBingoPlugin
  let ctx: ReturnType<typeof createMockContext>

  beforeEach(async () => {
    ctx = createMockContext()
    plugin = new PlaylistBingoPlugin({
      enabled: true,
      mode: "competitive",
      coinReward: 5,
      category: "mixed",
      criteria: makeCriteria(BINGO_FILLABLE_CELLS),
      winnerLabel: "Bingo Winner",
    })
    // Minimal register without BasePlugin redis wiring
    ;(plugin as any).context = {
      roomId: ctx.roomId,
      storage: ctx.storage,
      api: ctx.api,
      game: ctx.game,
      inventory: ctx.inventory,
      personas: ctx.personas,
    }
    ;(plugin as any).getConfig = async () => ({
      ...defaultPlaylistBingoConfig,
      enabled: true,
      mode: "competitive",
      coinReward: 5,
      category: "mixed",
      criteria: makeCriteria(BINGO_FILLABLE_CELLS),
      winnerLabel: "Bingo Winner",
      soundEffectOnBingo: false,
    })
  })

  it("refuses startRound without active game session", async () => {
    ctx.game.getActiveSession.mockResolvedValueOnce(null as any)
    const result = await plugin.executeAction("startRound", { userId: "admin" })
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/game session/i)
  })

  it("refuses mixed start with too few criteria", async () => {
    ;(plugin as any).getConfig = async () => ({
      enabled: true,
      mode: "competitive",
      category: "mixed",
      criteria: makeCriteria(3),
      winnerLabel: "",
      soundEffectOnBingo: false,
      coinReward: 5,
      yearStart: 1960,
      yearEnd: 1980,
      decadeStart: 1930,
      decadeEnd: 2010,
      bingoMessageTemplate: "{{username}} bingo",
    })
    const result = await plugin.executeAction("startRound", { userId: "admin" })
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/24/)
  })

  it("deals cards on startRound", async () => {
    const result = await plugin.executeAction("startRound", { userId: "admin" })
    expect(result.success).toBe(true)
    expect(ctx.cards.size).toBe(1)
    const card = JSON.parse(ctx.cards.get("u1")!)
    expect(card.cells).toHaveLength(25)
  })

  it("PvP ends round on first bingo", async () => {
    await plugin.executeAction("startRound", { userId: "admin" })
    const card = JSON.parse(ctx.cards.get("u1")!)
    // Force almost-bingo: mark all but leave matching to fill last
    for (const cell of card.cells) {
      if (!cell.free) cell.marked = true
    }
    // Unmark one cell and set criterion to match upcoming track
    const target = card.cells.find((c: { free?: boolean }) => !c.free)!
    target.marked = false
    target.criterion = { id: "t", type: "titleContains", value: "bingo" }
    target.label = "Title contains bingo"
    ctx.cards.set("u1", JSON.stringify(card))

    const track = queueItemFactory.build({
      track: metadataSourceTrackFactory.build({ title: "bingo hit" }),
      title: "bingo hit",
    })

    await (plugin as any).onPlaylistTrackAdded({ roomId: "room-1", track })

    const round = JSON.parse((await ctx.storage.get("round"))!)
    expect(round.active).toBe(false)
    expect(ctx.game.addScore).toHaveBeenCalled()
    expect(ctx.api.sendSystemMessage).toHaveBeenCalled()
  })

  it("PvG locks winner and keeps round active", async () => {
    ;(plugin as any).getConfig = async () => ({
      enabled: true,
      mode: "inclusive",
      coinReward: 5,
      category: "mixed",
      criteria: makeCriteria(BINGO_FILLABLE_CELLS),
      winnerLabel: "Bingo Winner",
      soundEffectOnBingo: false,
      yearStart: 1960,
      yearEnd: 1980,
      decadeStart: 1930,
      decadeEnd: 2010,
      bingoMessageTemplate: "{{username}} bingo +{{coins}}",
      soundEffectOnBingoUrl: "https://example.com/x.mp3",
      winnerIcon: "Trophy",
    })
    await plugin.executeAction("startRound", { userId: "admin" })
    const card = JSON.parse(ctx.cards.get("u1")!)
    for (const cell of card.cells) {
      if (!cell.free) cell.marked = true
    }
    const target = card.cells.find((c: { free?: boolean }) => !c.free)!
    target.marked = false
    target.criterion = { id: "t", type: "titleContains", value: "bingo" }
    ctx.cards.set("u1", JSON.stringify(card))

    const track = queueItemFactory.build({
      track: metadataSourceTrackFactory.build({ title: "bingo hit" }),
      title: "bingo hit",
    })
    await (plugin as any).onPlaylistTrackAdded({ roomId: "room-1", track })

    const round = JSON.parse((await ctx.storage.get("round"))!)
    expect(round.active).toBe(true)
    const updated = JSON.parse(ctx.cards.get("u1")!)
    expect(updated.status).toBe("locked")
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { messageMatchesTarget, stripMetadataSuffixes } from "./matching"
import { GuessTheTunePlugin, propsInPlay } from "./index"
import { defaultGuessTheTuneConfig, type GuessTheTuneConfig } from "./types"
import { queueItemStableKey } from "@repo/types"
import type {
  ChatMessage,
  PluginAPI,
  PluginContext,
  PluginLifecycle,
  PluginStorage,
  QueueItem,
  SystemEventPayload,
} from "@repo/types"

function roundKey(stable: string): string {
  return `round:${stable}`
}

function createNowPlaying(overrides?: {
  title?: string
  artist?: string
  album?: string
  trackId?: string
}): QueueItem {
  const title = overrides?.title ?? "Imagine"
  const artist = overrides?.artist ?? "John Lennon"
  const album = overrides?.album ?? "Imagine"
  const trackId = overrides?.trackId ?? "track-1"
  return {
    title,
    mediaSource: { type: "spotify", trackId },
    track: {
      title,
      artists: [{ title: artist }],
      album: { title: album },
    },
    addedAt: 1000,
    playedAt: 2000,
  } as QueueItem
}

function createChatMessage(content: string, userId: string, username?: string): ChatMessage {
  return {
    content,
    user: {
      userId,
      username: username ?? `User ${userId}`,
    },
  } as ChatMessage
}

/** In-memory hash storage for round reveal state. */
function createInMemoryStorage(): PluginStorage & {
  hashes: Map<string, Record<string, string>>
} {
  const hashes = new Map<string, Record<string, string>>()

  return {
    hashes,
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    inc: vi.fn().mockResolvedValue(1),
    dec: vi.fn().mockResolvedValue(0),
    del: vi.fn(async (key: string) => {
      hashes.delete(key)
    }),
    exists: vi.fn().mockResolvedValue(false),
    mget: vi.fn().mockResolvedValue([]),
    pipeline: vi.fn().mockResolvedValue([]),
    zadd: vi.fn().mockResolvedValue(undefined),
    zrem: vi.fn().mockResolvedValue(undefined),
    zincrby: vi.fn().mockResolvedValue(0),
    zrange: vi.fn().mockResolvedValue([]),
    zrangeWithScores: vi.fn().mockResolvedValue([]),
    zrangebyscore: vi.fn().mockResolvedValue([]),
    zremrangebyscore: vi.fn().mockResolvedValue(undefined),
    zscore: vi.fn().mockResolvedValue(null),
    zrank: vi.fn().mockResolvedValue(null),
    zrevrank: vi.fn().mockResolvedValue(null),
    hget: vi.fn(async (key: string, field: string) => hashes.get(key)?.[field] ?? null),
    hset: vi.fn(async (key: string, field: string, value: string) => {
      const h = hashes.get(key) ?? {}
      h[field] = value
      hashes.set(key, h)
    }),
    hgetall: vi.fn(async (key: string) => ({ ...(hashes.get(key) ?? {}) })),
    hsetnx: vi.fn(async (key: string, field: string, value: string) => {
      const h = hashes.get(key) ?? {}
      if (field in h) return false
      h[field] = value
      hashes.set(key, h)
      return true
    }),
  }
}

function createMockContext(roomId = "room1"): PluginContext & {
  _lifecycleHandlers: Map<string, Function[]>
} {
  const lifecycleHandlers = new Map<string, Function[]>()
  const storage = createInMemoryStorage()

  const mockApi: PluginAPI = {
    getNowPlaying: vi.fn().mockResolvedValue(null),
    getReactions: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue([]),
    getUsersByIds: vi.fn().mockResolvedValue([]),
    skipTrack: vi.fn().mockResolvedValue(undefined),
    sendSystemMessage: vi.fn().mockResolvedValue(undefined),
    sendUserSystemMessage: vi.fn().mockResolvedValue(undefined),
    getPluginConfig: vi.fn().mockResolvedValue(null),
    setPluginConfig: vi.fn().mockResolvedValue(undefined),
    updatePlaylistTrack: vi.fn().mockResolvedValue(undefined),
    getQueue: vi.fn().mockResolvedValue([]),
    emit: vi.fn().mockResolvedValue(undefined),
    queueSoundEffect: vi.fn().mockResolvedValue(undefined),
    queueScreenEffect: vi.fn().mockResolvedValue(undefined),
  }

  const mockGame = {
    getActiveSession: vi.fn().mockResolvedValue(null),
    startSession: vi.fn(),
    endSession: vi.fn(),
    registerAttributes: vi.fn(),
    addScore: vi.fn().mockResolvedValue(undefined),
    setScore: vi.fn(),
    applyModifier: vi.fn(),
    removeModifier: vi.fn(),
    getUserState: vi.fn(),
    getLeaderboard: vi.fn(),
    applyTimedModifier: vi.fn(),
  }

  const mockLifecycle: PluginLifecycle = {
    on: vi.fn((event: string, handler: Function) => {
      if (!lifecycleHandlers.has(event)) {
        lifecycleHandlers.set(event, [])
      }
      lifecycleHandlers.get(event)!.push(handler)
    }),
    off: vi.fn(),
  }

  return {
    roomId,
    api: mockApi,
    storage,
    lifecycle: mockLifecycle,
    game: mockGame,
    getRoom: vi.fn().mockResolvedValue(null),
    appContext: {} as never,
    _lifecycleHandlers: lifecycleHandlers,
  }
}

async function emitMessage(
  ctx: PluginContext & { _lifecycleHandlers: Map<string, Function[]> },
  message: ChatMessage,
): Promise<void> {
  const handlers = ctx._lifecycleHandlers.get("MESSAGE_RECEIVED")
  if (!handlers?.length) throw new Error("MESSAGE_RECEIVED handler not registered")
  const payload: SystemEventPayload<"MESSAGE_RECEIVED"> = { message, roomId: ctx.roomId }
  for (const handler of handlers) {
    await handler(payload)
  }
}

async function setupActiveRound(
  ctx: PluginContext & { storage: ReturnType<typeof createInMemoryStorage> },
  np: QueueItem,
): Promise<string> {
  const rk = roundKey(queueItemStableKey(np))
  await ctx.storage.hset(rk, "startedAt", String(Date.now()))
  vi.mocked(ctx.api.getNowPlaying).mockResolvedValue(np)
  return rk
}

describe("messageMatchesTarget", () => {
  it("matches exact substring", () => {
    expect(messageMatchesTarget("I love Pink Floyd", "Pink Floyd", 0.5)).toBe(true)
  })

  it("matches fuzzy when each target word appears in the message", () => {
    expect(messageMatchesTarget("pink floyed?", "Pink Floyd", 0.55)).toBe(true)
  })

  it("rejects unrelated text", () => {
    expect(messageMatchesTarget("hello world", "Metallica", 0.35)).toBe(false)
  })

  it("does not match a single word from a long title", () => {
    expect(messageMatchesTarget("how", "How Music Makes You Feel Better", 0.45)).toBe(false)
  })

  it("matches when every title word is represented (with per-word typos)", () => {
    expect(
      messageMatchesTarget(
        "How music makes u feel better",
        "How Music Makes You Feel Better",
        0.55,
      ),
    ).toBe(true)
  })

  it("does not match a tiny fragment against a one-word title", () => {
    expect(messageMatchesTarget("ch", "charlie", 0.55)).toBe(false)
  })

  it("matches a one-word title when the guess is long enough to be a real attempt", () => {
    expect(messageMatchesTarget("charlie", "charlie", 0.55)).toBe(true)
    expect(messageMatchesTarget("charl", "charlie", 0.55)).toBe(true)
  })

  it("matches core title when catalog has hyphen remaster/year suffix", () => {
    expect(messageMatchesTarget("Yesterday", "Yesterday - Remastered 2009", 0.55)).toBe(true)
    expect(messageMatchesTarget("come together", "Come Together - 2019 Mix", 0.55)).toBe(true)
  })

  it("matches core title when hyphen suffix has year plus stereo/mono remaster wording", () => {
    expect(messageMatchesTarget("Picture Book", "Picture Book - 2018 Stereo Remaster", 0.55)).toBe(
      true,
    )
    expect(stripMetadataSuffixes("Picture Book - 2018 Stereo Remaster")).toBe("Picture Book")
  })

  it("matches core title when catalog has parenthetical remaster/edition", () => {
    expect(
      messageMatchesTarget("Bohemian Rhapsody", "Bohemian Rhapsody (2011 Remaster)", 0.55),
    ).toBe(true)
    expect(messageMatchesTarget("Hotel California", "Hotel California (2013 Remaster)", 0.55)).toBe(
      true,
    )
    expect(messageMatchesTarget("Purple Rain", "Purple Rain (Deluxe Edition)", 0.55)).toBe(true)
    expect(
      messageMatchesTarget("Song Title", "Song Title (2008 Remastered LP Version)", 0.55),
    ).toBe(true)
  })

  it("matches when stripping live/radio-edit style suffixes", () => {
    expect(messageMatchesTarget("Stairway to Heaven", "Stairway to Heaven - Live", 0.55)).toBe(true)
    expect(messageMatchesTarget("Wonderwall", "Wonderwall - Radio Edit", 0.55)).toBe(true)
  })

  it("matches after stripping multiple suffix segments", () => {
    expect(messageMatchesTarget("Song Title", "Song Title (Live) - Remastered 2009", 0.55)).toBe(
      true,
    )
  })

  it("does not strip unrelated trailing parentheses (matching still needs those words)", () => {
    const title = "Heart Skips a Beat (When You Walk By)"
    expect(stripMetadataSuffixes(title)).toBe(title)
    expect(messageMatchesTarget("Heart Skips a Beat", title, 0.55)).toBe(false)
    expect(messageMatchesTarget("Heart Skips a Beat When You Walk By", title, 0.55)).toBe(true)
    expect(messageMatchesTarget("Heart Skips", title, 0.55)).toBe(false)
  })
})

describe("stripMetadataSuffixes", () => {
  it("removes hyphen remaster and year variants", () => {
    expect(stripMetadataSuffixes("Yesterday - Remastered 2009")).toBe("Yesterday")
    expect(stripMetadataSuffixes("Track - 1977 Remaster")).toBe("Track")
    expect(stripMetadataSuffixes("Come Together - 2019 Mix")).toBe("Come Together")
  })

  it("removes parenthetical metadata", () => {
    expect(stripMetadataSuffixes("Foo (2011 Remaster)")).toBe("Foo")
    expect(stripMetadataSuffixes("Foo (Remastered 2009)")).toBe("Foo")
    expect(stripMetadataSuffixes("Album (Super Deluxe)")).toBe("Album")
    expect(stripMetadataSuffixes("Title (feat. Someone)")).toBe("Title")
  })

  it("iterates until stable for combined suffixes", () => {
    expect(stripMetadataSuffixes("Song (Live) - Remastered 2009")).toBe("Song")
    expect(stripMetadataSuffixes("Bar (2011 Remaster) - Deluxe Edition")).toBe("Bar")
  })

  it("leaves creative titles unchanged when suffix is not catalog metadata", () => {
    expect(stripMetadataSuffixes("Heart Skips a Beat (When You Walk By)")).toBe(
      "Heart Skips a Beat (When You Walk By)",
    )
    expect(stripMetadataSuffixes("Nothing Else Matters")).toBe("Nothing Else Matters")
  })
})

describe("propsInPlay", () => {
  const base = { ...defaultGuessTheTuneConfig }

  it("returns only fields that are enabled and non-empty", () => {
    expect(
      propsInPlay(
        { ...base, matchTitle: true, matchArtist: false, matchAlbum: true },
        { title: "  x  ", artist: "A", album: "" },
      ),
    ).toEqual(["title"])
  })

  it("returns title artist album in stable order when all apply", () => {
    expect(
      propsInPlay(
        { ...base, matchTitle: true, matchArtist: true, matchAlbum: true },
        { title: "T", artist: "A", album: "L" },
      ),
    ).toEqual(["title", "artist", "album"])
  })
})

describe("GuessTheTunePlugin onMessageReceived", () => {
  const enabledConfig: Partial<GuessTheTuneConfig> = {
    enabled: true,
    soundEffectOnMatch: false,
    fuzzyThreshold: 0.35,
  }

  let plugin: GuessTheTunePlugin
  let mockContext: ReturnType<typeof createMockContext>

  beforeEach(() => {
    plugin = new GuessTheTunePlugin(enabledConfig)
    mockContext = createMockContext()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("self-titled track: first user reveals title and album; repeat guess reveals nothing", async () => {
    const np = createNowPlaying({ title: "Imagine", album: "Imagine", artist: "John Lennon" })
    const rk = await setupActiveRound(mockContext, np)
    await plugin.register(mockContext)

    await emitMessage(mockContext, createChatMessage("imagine", "u1", "Alice"))

    const afterFirst = await mockContext.storage.hgetall(rk)
    expect(afterFirst["revealed:title"]).toBeTruthy()
    expect(afterFirst["revealed:album"]).toBeTruthy()
    expect(afterFirst["revealed:artist"]).toBeUndefined()
    expect(JSON.parse(afterFirst["revealed:title"]!).userId).toBe("u1")
    expect(JSON.parse(afterFirst["revealed:album"]!).userId).toBe("u1")

    const zincrbyCallsAfterFirst = vi.mocked(mockContext.storage.zincrby).mock.calls.length
    const emitCallsAfterFirst = vi.mocked(mockContext.api.emit).mock.calls.length
    const systemMessagesAfterFirst = vi.mocked(mockContext.api.sendSystemMessage).mock.calls.length

    await emitMessage(mockContext, createChatMessage("imagine", "u2", "Bob"))

    const afterSecond = await mockContext.storage.hgetall(rk)
    expect(afterSecond["revealed:artist"]).toBeUndefined()
    expect(JSON.parse(afterSecond["revealed:title"]!).userId).toBe("u1")
    expect(JSON.parse(afterSecond["revealed:album"]!).userId).toBe("u1")
    expect(vi.mocked(mockContext.storage.zincrby).mock.calls.length).toBe(zincrbyCallsAfterFirst)
    expect(vi.mocked(mockContext.api.emit).mock.calls.length).toBe(emitCallsAfterFirst)
    expect(vi.mocked(mockContext.api.sendSystemMessage).mock.calls.length).toBe(
      systemMessagesAfterFirst,
    )
  })

  it("non-overlapping guess reveals only the matching property", async () => {
    const np = createNowPlaying({
      title: "Yesterday",
      artist: "The Beatles",
      album: "Help!",
    })
    const rk = await setupActiveRound(mockContext, np)
    await plugin.register(mockContext)

    await emitMessage(mockContext, createChatMessage("yesterday", "u1"))

    const revealed = await mockContext.storage.hgetall(rk)
    expect(revealed["revealed:title"]).toBeTruthy()
    expect(revealed["revealed:artist"]).toBeUndefined()
    expect(revealed["revealed:album"]).toBeUndefined()
    expect(vi.mocked(mockContext.storage.zincrby)).toHaveBeenCalledTimes(1)
  })

  it("repeat guess after title revealed does not reveal album when guess matches both", async () => {
    const np = createNowPlaying({
      title: "Imagine",
      artist: "John Lennon",
      album: "Imagine",
    })
    const rk = await setupActiveRound(mockContext, np)
    await plugin.register(mockContext)

    await mockContext.storage.hset(
      rk,
      "revealed:title",
      JSON.stringify({ userId: "u1", username: "Alice", at: Date.now() }),
    )

    await emitMessage(mockContext, createChatMessage("imagine", "u2"))

    const revealed = await mockContext.storage.hgetall(rk)
    expect(revealed["revealed:album"]).toBeUndefined()
    expect(revealed["revealed:artist"]).toBeUndefined()
    expect(vi.mocked(mockContext.storage.zincrby)).not.toHaveBeenCalled()
  })

  it("losing hsetnx race on a matched prop exits without revealing other props", async () => {
    const np = createNowPlaying({
      title: "Imagine",
      artist: "John Lennon",
      album: "Imagine",
    })
    const rk = await setupActiveRound(mockContext, np)
    await plugin.register(mockContext)

    let titleHsetnxCalls = 0
    vi.mocked(mockContext.storage.hsetnx).mockImplementation(async (key, field, value) => {
      if (field === "revealed:title") {
        titleHsetnxCalls += 1
        if (titleHsetnxCalls === 1) return false
      }
      const h = mockContext.storage.hashes.get(key) ?? {}
      if (field in h) return false
      h[field] = value
      mockContext.storage.hashes.set(key, h)
      return true
    })

    await emitMessage(mockContext, createChatMessage("imagine", "u2"))

    const revealed = await mockContext.storage.hgetall(rk)
    expect(revealed["revealed:title"]).toBeUndefined()
    expect(revealed["revealed:album"]).toBeUndefined()
    expect(revealed["revealed:artist"]).toBeUndefined()
    expect(vi.mocked(mockContext.storage.zincrby)).not.toHaveBeenCalled()
  })
})

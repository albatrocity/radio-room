import { describe, expect, it, vi } from "vitest"
import type { EscrowPledge, EscrowPoolState } from "@repo/plugin-base"
import {
  adoptLegacyPledges,
  hasActiveCoinLock,
  pledge,
  settleFundingSuccess,
  settleFundingFailure,
  startCampaign,
  isDeliverySuccessful,
} from "./index"
import { KICKSTARTER_POOL_KEY, KICKSTARTER_STORAGE_KEY, type KickstarterCampaign } from "./types"
import type { GameSessionPluginAPI, PluginContext, UserGameState } from "@repo/types"

function makeCampaign(overrides?: Partial<KickstarterCampaign>): KickstarterCampaign {
  return {
    id: "c1",
    ownerUserId: "owner",
    ownerName: "Owner",
    title: "Cool Thing",
    rewards: "Stickers",
    goal: 10,
    pledged: 0,
    phase: "funding",
    phaseStartedAt: Date.now(),
    phaseEndsAt: Date.now() + 60_000,
    pollId: null,
    pollYesOptionId: null,
    pollNoOptionId: null,
    pollAttemptStartedAt: null,
    ...overrides,
  }
}

function makePool(
  campaign: KickstarterCampaign,
  pledges: Omit<EscrowPledge, "at">[] = [],
): EscrowPoolState {
  return {
    id: campaign.id,
    title: campaign.title,
    goal: campaign.goal,
    openedAt: campaign.phaseStartedAt,
    closesAt: campaign.phaseEndsAt,
    status: "open",
    raised: pledges.reduce((sum, p) => sum + p.amount, 0),
    pledges: pledges.map((p) => ({ ...p, at: campaign.phaseStartedAt })),
  }
}

function makeDeps(opts?: {
  campaign?: KickstarterCampaign | null
  pool?: EscrowPoolState | null
  balances?: Record<string, number>
  locked?: Set<string>
}) {
  const store = new Map<string, string>()
  if (opts?.campaign) store.set(KICKSTARTER_STORAGE_KEY, JSON.stringify(opts.campaign))
  const pool = opts?.pool ?? (opts?.campaign?.phase === "funding" ? makePool(opts.campaign) : null)
  if (pool) store.set(KICKSTARTER_POOL_KEY, JSON.stringify(pool))
  const balances = { ...(opts?.balances ?? { owner: 0, backer: 100 }) }
  const locked = opts?.locked ?? new Set<string>()

  const storage = {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v)
    }),
    getJson: vi.fn(async <T>(k: string) => {
      const raw = store.get(k) ?? null
      if (!raw) return { raw: null, value: null }
      try { return { raw, value: JSON.parse(raw) as T } } catch { return { raw, value: null } }
    }),
    setJson: vi.fn(async (k: string, v: unknown) => {
      store.set(k, JSON.stringify(v))
    }),
    compareAndSet: vi.fn(async (k: string, expected: string | null, v: string) => {
      if ((store.get(k) ?? null) !== expected) return false
      store.set(k, v)
      return true
    }),
    del: vi.fn(async (k: string) => {
      store.delete(k)
    }),
  }

  const game = {
    getActiveSession: vi.fn(async () => ({ id: "s1" })),
    getUserState: vi.fn(async (userId: string): Promise<UserGameState> => {
      const now = Date.now()
      return {
        userId,
        attributes: { coin: balances[userId] ?? 0, score: 0 },
        modifiers: locked.has(userId)
          ? [
              {
                id: "lock",
                name: "Frozen Assets",
                source: "item-shops",
                effects: [{ type: "lock", target: "coin" }],
                startAt: now - 1,
                endAt: now + 60_000,
                stackBehavior: "replace",
              },
            ]
          : [],
      }
    }),
    addScore: vi.fn(async (userId: string, _attr: string, amount: number) => {
      balances[userId] = (balances[userId] ?? 0) + amount
      return balances[userId]
    }),
    applyTimedModifier: vi.fn(async () => ({ ok: true as const, modifierId: "m1" })),
  }

  const context = {
    roomId: "room-1",
    storage,
    api: {},
  } as unknown as PluginContext

  const read = <T>(key: string): T | null => {
    const raw = store.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  }

  return {
    deps: { context, game: game as unknown as GameSessionPluginAPI },
    storage,
    game,
    getStored: () => read<KickstarterCampaign>(KICKSTARTER_STORAGE_KEY),
    getPool: () => read<EscrowPoolState>(KICKSTARTER_POOL_KEY),
    balances,
  }
}

describe("isDeliverySuccessful", () => {
  it("treats zero votes as success", () => {
    expect(isDeliverySuccessful(0, 0)).toBe(true)
  })

  it("succeeds when yes is at least half", () => {
    expect(isDeliverySuccessful(2, 2)).toBe(true)
  })

  it("fails when yes is strictly less than half", () => {
    expect(isDeliverySuccessful(1, 2)).toBe(false)
  })
})

describe("hasActiveCoinLock", () => {
  it("detects an active coin lock", () => {
    const now = Date.now()
    expect(
      hasActiveCoinLock({
        userId: "u",
        attributes: { coin: 1, score: 0 },
        modifiers: [
          {
            id: "1",
            name: "Frozen Assets",
            source: "x",
            effects: [{ type: "lock", target: "coin" }],
            startAt: now - 1,
            endAt: now + 1000,
            stackBehavior: "replace",
          },
        ],
      }),
    ).toBe(true)
  })
})

describe("kickstarter lifecycle", () => {
  it("starts a campaign and opens its escrow pool", async () => {
    const { deps, getStored, getPool } = makeDeps()
    const result = await startCampaign(deps, {
      ownerUserId: "owner",
      ownerName: "Owner",
      title: "Album",
      rewards: "Vinyl",
      goal: 20,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(getStored()?.goal).toBe(20)
    expect(getPool()).toMatchObject({ id: result.campaign.id, goal: 20, status: "open", raised: 0 })
    expect(result.publicState.campaignPool).toMatchObject({
      title: "Album",
      goal: 20,
      raised: 0,
      open: true,
      body: "Vinyl",
    })
  })

  it("refunds a stale pool left behind before opening a new one", async () => {
    const stale = makePool(makeCampaign({ id: "old" }), [{ id: "p1", userId: "b1", amount: 4 }])
    const { deps, balances, getPool } = makeDeps({ pool: stale, balances: { b1: 0 } })
    const result = await startCampaign(deps, {
      ownerUserId: "owner",
      ownerName: "Owner",
      title: "Album",
      rewards: "Vinyl",
      goal: 20,
    })
    expect(result.ok).toBe(true)
    expect(balances.b1).toBe(4)
    expect(getPool()?.pledges).toEqual([])
  })

  it("rejects a second concurrent campaign", async () => {
    const { deps } = makeDeps({ campaign: makeCampaign() })
    const result = await startCampaign(deps, {
      ownerUserId: "owner",
      ownerName: "Owner",
      title: "Album",
      rewards: "Vinyl",
      goal: 20,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/already running/)
  })

  it("pledges and pays owner the full overage on success", async () => {
    const { deps, game, balances, getStored, getPool } = makeDeps({
      campaign: makeCampaign({ goal: 10 }),
      balances: { owner: 0, backer: 100 },
    })
    const p1 = await pledge(deps, { userId: "backer", username: "B", amount: 15 })
    expect(p1.ok).toBe(true)
    if (!p1.ok) return
    expect(p1.goalMet).toBe(true)
    expect(balances.backer).toBe(85)

    const settled = await settleFundingSuccess(deps, p1.campaign)
    expect(game.addScore).toHaveBeenCalledWith(
      "owner",
      "coin",
      15,
      "kickstarter:payout",
      { intent: "exact" },
    )
    expect(balances.owner).toBe(15)
    expect(settled?.campaign.phase).toBe("deliveryWait")
    expect(getStored()?.pledged).toBe(15)
    expect(getPool()).toBeNull()
  })

  it("pays out once when goal-met and the deadline race", async () => {
    const campaign = makeCampaign({ goal: 5 })
    const { deps, balances } = makeDeps({
      campaign,
      pool: makePool(campaign, [{ id: "p1", userId: "backer", amount: 6 }]),
      balances: { owner: 0 },
    })
    const [a, b] = await Promise.all([
      settleFundingSuccess(deps, campaign),
      settleFundingSuccess(deps, campaign),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(balances.owner).toBe(6)
  })

  it("never refunds backers after the owner was paid (success racing failure)", async () => {
    const campaign = makeCampaign({ goal: 5 })
    const { deps, balances } = makeDeps({
      campaign,
      pool: makePool(campaign, [{ id: "p1", userId: "backer", amount: 6 }]),
      balances: { owner: 0, backer: 0 },
    })
    await Promise.all([settleFundingSuccess(deps, campaign), settleFundingFailure(deps)])
    // Exactly one path moved the 6 coins: to the owner or back to the backer, never both.
    expect(balances.owner + balances.backer).toBe(6)
  })

  it("refunds pledges on funding failure", async () => {
    const campaign = makeCampaign()
    const { deps, balances, getStored, getPool } = makeDeps({
      campaign,
      pool: makePool(campaign, [
        { id: "p1", userId: "b1", username: "B1", amount: 3 },
        { id: "p2", userId: "b2", username: "B2", amount: 4 },
      ]),
      balances: { owner: 0, b1: 0, b2: 0 },
    })
    const result = await settleFundingFailure(deps)
    expect(result.refunded).toBe(7)
    expect(balances.b1).toBe(3)
    expect(balances.b2).toBe(4)
    expect(getStored()).toBeNull()
    expect(getPool()).toBeNull()
  })

  it("rejects pledges from coin-locked users", async () => {
    const { deps, balances } = makeDeps({
      campaign: makeCampaign(),
      balances: { backer: 50 },
      locked: new Set(["backer"]),
    })
    const result = await pledge(deps, { userId: "backer", username: "B", amount: 5 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/frozen/i)
    expect(balances.backer).toBe(50)
  })

  it("rejects pledges that exceed balance", async () => {
    const { deps } = makeDeps({
      campaign: makeCampaign(),
      balances: { backer: 2 },
    })
    const result = await pledge(deps, { userId: "backer", username: "B", amount: 5 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/enough coin/)
  })

  it("rejects pledges when no campaign is funding", async () => {
    const { deps } = makeDeps({ campaign: makeCampaign({ phase: "deliveryWait" }) })
    const result = await pledge(deps, { userId: "backer", username: "B", amount: 5 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/No funding campaign/)
  })

  it("keeps both pledges when concurrent CAS collisions retry without refund churn", async () => {
    const { deps, storage, balances, getPool, game } = makeDeps({
      campaign: makeCampaign({ goal: 100 }),
      balances: { backer: 50, backer2: 50 },
    })

    const realCas = storage.compareAndSet.getMockImplementation()!
    let casCalls = 0
    storage.compareAndSet.mockImplementation(
      async (k: string, expected: string | null, v: string) => {
        casCalls += 1
        // Force the first write to lose once so the retry path runs (no debit yet).
        if (casCalls === 1) return false
        return realCas(k, expected, v)
      },
    )

    const first = await pledge(deps, { userId: "backer", username: "B", amount: 5 })
    expect(first.ok).toBe(true)
    expect(balances.backer).toBe(45)
    expect(game.addScore).toHaveBeenCalledTimes(1)

    const second = await pledge(deps, { userId: "backer2", username: "B2", amount: 7 })
    expect(second.ok).toBe(true)
    expect(balances.backer2).toBe(43)

    expect(getPool()?.raised).toBe(12)
    expect(getPool()?.pledges).toHaveLength(2)
  })

  it("rolls back the pool pledge when debit fails after CAS", async () => {
    const { deps, game, getPool, balances } = makeDeps({
      campaign: makeCampaign({ goal: 100 }),
      balances: { backer: 50 },
    })
    game.addScore.mockImplementation(async () => balances.backer)
    const result = await pledge(deps, { userId: "backer", username: "B", amount: 5 })
    expect(result.ok).toBe(false)
    expect(getPool()?.pledges).toEqual([])
    expect(getPool()?.raised).toBe(0)
  })

  it("keeps per-backer rows out of public state", async () => {
    const campaign = makeCampaign()
    const { deps } = makeDeps({
      campaign,
      pool: makePool(campaign, [{ id: "existing", userId: "backer", username: "B", amount: 5 }]),
      balances: { backer: 100 },
    })
    const result = await pledge(deps, { userId: "backer", username: "B", amount: 3 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.publicState.campaign).not.toHaveProperty("pledges")
    expect(result.publicState.campaign?.pledged).toBe(8)
    expect(result.publicState.campaignPool?.raised).toBe(8)
    expect(result.publicState.campaignPool).not.toHaveProperty("topContributors")
  })

  it("moves inline pledges from an old campaign record into the pool", async () => {
    const campaign = {
      ...makeCampaign({ pledged: 9 }),
      pledges: [{ id: "p1", userId: "b1", username: "B1", amount: 9 }],
    } as KickstarterCampaign
    const { deps, getStored, getPool } = makeDeps({ campaign, pool: null })
    // makeDeps seeds a pool for funding campaigns; legacy records had none.
    await deps.context.storage.del(KICKSTARTER_POOL_KEY)
    await adoptLegacyPledges(deps)
    expect(getStored()).not.toHaveProperty("pledges")
    expect(getPool()).toMatchObject({ id: "c1", raised: 9, status: "open" })
    expect(getPool()?.pledges[0]).toMatchObject({ userId: "b1", amount: 9 })
  })
})

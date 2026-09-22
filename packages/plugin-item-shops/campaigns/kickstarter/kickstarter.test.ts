import { describe, expect, it, vi } from "vitest"
import {
  hasActiveCoinLock,
  pledge,
  settleFundingSuccess,
  settleFundingFailure,
  startCampaign,
  tallyDeliveryVotes,
} from "./index"
import type { KickstarterCampaign } from "./types"
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
    pledges: [],
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

function makeDeps(opts?: {
  campaign?: KickstarterCampaign | null
  balances?: Record<string, number>
  locked?: Set<string>
}) {
  let stored: KickstarterCampaign | null = opts?.campaign ?? null
  const balances = { ...(opts?.balances ?? { owner: 0, backer: 100 }) }
  const locked = opts?.locked ?? new Set<string>()

  const storage = {
    get: vi.fn(async () => (stored ? JSON.stringify(stored) : null)),
    set: vi.fn(async (_k: string, v: string) => {
      stored = JSON.parse(v) as KickstarterCampaign
    }),
    compareAndSet: vi.fn(async (_k: string, expected: string | null, v: string) => {
      const current = stored ? JSON.stringify(stored) : null
      if (current !== expected) return false
      stored = JSON.parse(v) as KickstarterCampaign
      return true
    }),
    del: vi.fn(async () => {
      stored = null
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

  return {
    deps: { context, game: game as unknown as GameSessionPluginAPI },
    storage,
    game,
    getStored: () => stored,
    balances,
  }
}

describe("tallyDeliveryVotes", () => {
  it("treats zero votes as success", () => {
    expect(
      tallyDeliveryVotes({ votes: {}, yesOptionId: "y", noOptionId: "n" }).success,
    ).toBe(true)
  })

  it("succeeds when yes is at least half", () => {
    expect(
      tallyDeliveryVotes({
        votes: { a: "y", b: "y", c: "n", d: "n" },
        yesOptionId: "y",
        noOptionId: "n",
      }).success,
    ).toBe(true)
  })

  it("fails when yes is strictly less than half", () => {
    expect(
      tallyDeliveryVotes({
        votes: { a: "y", b: "n", c: "n" },
        yesOptionId: "y",
        noOptionId: "n",
      }).success,
    ).toBe(false)
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
  it("starts a campaign", async () => {
    const { deps, getStored } = makeDeps()
    const result = await startCampaign(deps, {
      ownerUserId: "owner",
      ownerName: "Owner",
      title: "Album",
      rewards: "Vinyl",
      goal: 20,
    })
    expect(result.ok).toBe(true)
    expect(getStored()?.goal).toBe(20)
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
    const { deps, game, balances, getStored } = makeDeps({
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
    expect(settled.campaign.phase).toBe("deliveryWait")
    expect(getStored()?.pledges).toEqual([])
  })

  it("refunds pledges on funding failure", async () => {
    const campaign = makeCampaign({
      pledged: 7,
      pledges: [
        { id: "p1", userId: "b1", username: "B1", amount: 3 },
        { id: "p2", userId: "b2", username: "B2", amount: 4 },
      ],
    })
    const { deps, balances } = makeDeps({
      campaign,
      balances: { owner: 0, b1: 0, b2: 0 },
    })
    const result = await settleFundingFailure(deps, campaign)
    expect(result.refunded).toBe(7)
    expect(balances.b1).toBe(3)
    expect(balances.b2).toBe(4)
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

  it("keeps both pledges when concurrent CAS collisions retry without refund churn", async () => {
    const { deps, storage, balances, getStored, game } = makeDeps({
      campaign: makeCampaign({ goal: 100 }),
      balances: { backer: 50, backer2: 50 },
    })

    let casCalls = 0
    storage.compareAndSet.mockImplementation(async (_k: string, expected: string | null, v: string) => {
      casCalls += 1
      // Force the first write to lose once so the retry path runs (no debit yet).
      if (casCalls === 1) return false
      const current = getStored() ? JSON.stringify(getStored()) : null
      if (current !== expected) return false
      await storage.set(_k, v)
      return true
    })

    const first = await pledge(deps, { userId: "backer", username: "B", amount: 5 })
    expect(first.ok).toBe(true)
    expect(balances.backer).toBe(45)
    // CAS-before-debit: a lost claim must not touch the ledger (no refund reason).
    expect(game.addScore.mock.calls.every((c) => c[3] !== "kickstarter:pledge-cas-refund")).toBe(
      true,
    )

    const second = await pledge(deps, { userId: "backer2", username: "B2", amount: 7 })
    expect(second.ok).toBe(true)
    expect(balances.backer2).toBe(43)

    const stored = getStored()
    expect(stored?.pledged).toBe(12)
    expect(stored?.pledges).toHaveLength(2)
  })

  it("rolls back Redis pledge when debit fails after CAS", async () => {
    const { deps, game, getStored, balances } = makeDeps({
      campaign: makeCampaign({ goal: 100 }),
      balances: { backer: 50 },
    })
    game.addScore.mockImplementation(async () => {
      // Simulate lock / no-op debit: balance unchanged
      return balances.backer
    })
    const result = await pledge(deps, { userId: "backer", username: "B", amount: 5 })
    expect(result.ok).toBe(false)
    expect(getStored()?.pledges).toEqual([])
    expect(getStored()?.pledged).toBe(0)
  })

  it("omits pledges from public state", async () => {
    const { deps } = makeDeps({
      campaign: makeCampaign({
        pledged: 5,
        pledges: [{ id: "existing", userId: "backer", username: "B", amount: 5 }],
      }),
      balances: { backer: 100 },
    })
    const result = await pledge(deps, { userId: "backer", username: "B", amount: 3 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.publicState.campaign).not.toHaveProperty("pledges")
    expect(result.publicState.campaign?.pledged).toBe(8)
  })
})

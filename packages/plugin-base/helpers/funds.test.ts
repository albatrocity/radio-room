import { describe, expect, it, vi } from "vitest"
import type { PluginStorage, UserGameState } from "@repo/types"
import {
  EscrowPoolHelper,
  collectShares,
  hasActiveCoinLock,
  splitProportional,
  topContributors,
} from "./funds"

function memoryStorage() {
  const data = new Map<string, string>()
  const storage = {
    getJson: vi.fn(async (key: string) => {
      const raw = data.get(key) ?? null
      return { raw, value: raw ? JSON.parse(raw) : null }
    }),
    compareAndSet: vi.fn(async (key: string, expected: string | null, value: string) => {
      if ((data.get(key) ?? null) !== expected) return false
      data.set(key, value)
      return true
    }),
    del: vi.fn(async (key: string) => {
      data.delete(key)
    }),
  }
  return { storage: storage as unknown as PluginStorage, raw: storage, data }
}

function lockedModifier() {
  const now = Date.now()
  return {
    id: "lock",
    name: "Frozen Assets",
    source: "item-shops",
    effects: [{ type: "lock" as const, target: "coin" as const }],
    startAt: now - 1,
    endAt: now + 60_000,
    stackBehavior: "replace" as const,
  }
}

function fakeGame(
  balances: Record<string, number>,
  opts: { locked?: string[]; noState?: string[] } = {},
) {
  const game = {
    getUserState: vi.fn(async (userId: string): Promise<UserGameState | null> => {
      if (opts.noState?.includes(userId)) return null
      return {
        userId,
        attributes: { coin: balances[userId] ?? 0, score: 0 },
        modifiers: opts.locked?.includes(userId) ? [lockedModifier()] : [],
      }
    }),
    addScore: vi.fn(async (userId: string, _attr: string, amount: number) => {
      if (opts.locked?.includes(userId)) return balances[userId] ?? 0
      balances[userId] = (balances[userId] ?? 0) + amount
      return balances[userId]!
    }),
  }
  return game
}

describe("splitProportional", () => {
  it("charges the same share of every wallet, rounded with largest remainders", () => {
    expect(
      splitProportional(120, [
        { userId: "rich", balance: 10_000 },
        { userId: "a", balance: 100 },
        { userId: "b", balance: 10 },
        { userId: "c", balance: 10 },
      ]),
    ).toEqual([
      { userId: "rich", amount: 119 },
      { userId: "a", amount: 1 },
      { userId: "b", amount: 0 },
      { userId: "c", amount: 0 },
    ])
  })

  it("takes everything when the room can't cover the cost, and never more than a wallet", () => {
    expect(
      splitProportional(500, [
        { userId: "a", balance: 30 },
        { userId: "b", balance: 0 },
        { userId: "c", balance: 12.9 },
      ]),
    ).toEqual([
      { userId: "a", amount: 30 },
      { userId: "b", amount: 0 },
      { userId: "c", amount: 12 },
    ])
  })

  it("sums exactly to the cost when covered", () => {
    const balances = [7, 13, 29, 51, 101].map((balance, i) => ({ userId: `u${i}`, balance }))
    const shares = splitProportional(37, balances)
    expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(37)
    shares.forEach((s, i) => expect(s.amount).toBeLessThanOrEqual(balances[i]!.balance))
  })

  it("charges nothing for a zero cost or empty room", () => {
    expect(splitProportional(0, [{ userId: "a", balance: 10 }])).toEqual([
      { userId: "a", amount: 0 },
    ])
    expect(splitProportional(10, [])).toEqual([])
  })
})

describe("collectShares", () => {
  it("debits each payer exactly and reports the rate", async () => {
    const balances = { a: 900, b: 100 }
    const game = fakeGame(balances)
    const result = await collectShares(game, {
      cost: 50,
      reason: "road-trip:gas",
      payers: ["a", "b"],
    })
    expect(result).toEqual({
      collected: 50,
      shortfall: 0,
      rate: 0.05,
      perUser: [
        { userId: "a", amount: 45 },
        { userId: "b", amount: 5 },
      ],
    })
    expect(balances).toEqual({ a: 855, b: 95 })
    expect(game.addScore).toHaveBeenCalledWith("a", "coin", -45, "road-trip:gas", {
      intent: "exact",
    })
  })

  it("leaves out coin-locked users, users without session state, and exempt users", async () => {
    const balances = { a: 100, locked: 1000, ghost: 1000, exempt: 1000 }
    const game = fakeGame(balances, { locked: ["locked"], noState: ["ghost"] })
    const result = await collectShares(game, {
      cost: 10,
      reason: "x",
      payers: ["a", "locked", "ghost", "exempt"],
      isExempt: (userId) => userId === "exempt",
    })
    expect(result.perUser).toEqual([{ userId: "a", amount: 10 }])
    expect(result.rate).toBe(0.1)
    expect(balances.locked).toBe(1000)
  })

  it("reports a shortfall when the room is broke", async () => {
    const game = fakeGame({ a: 3, b: 4 })
    const result = await collectShares(game, { cost: 20, reason: "x", payers: ["a", "b", "a"] })
    expect(result).toMatchObject({ collected: 7, shortfall: 13, rate: 1 })
  })

  it("debits only what's left when a payer spent in between", async () => {
    const balances = { a: 100 }
    const game = fakeGame(balances)
    let reads = 0
    game.getUserState.mockImplementation(async (userId: string) => {
      reads += 1
      if (reads === 2) balances.a = 4
      return { userId, attributes: { coin: balances.a, score: 0 }, modifiers: [] }
    })
    const result = await collectShares(game, { cost: 10, reason: "x", payers: ["a"] })
    expect(result).toMatchObject({ collected: 4, shortfall: 6 })
  })
})

describe("EscrowPoolHelper", () => {
  function setup(balances: Record<string, number> = { a: 100, b: 100 }, locked: string[] = []) {
    const mem = memoryStorage()
    const game = fakeGame(balances, { locked })
    const pool = new EscrowPoolHelper(
      { storage: mem.storage, game },
      { key: "fund", reason: "trip" },
    )
    return { pool, game, balances, mem }
  }

  it("opens one pool at a time and reopens once closed", async () => {
    const { pool } = setup()
    expect((await pool.open({ id: "p1", title: "Gas", goal: 10 })).ok).toBe(true)
    expect(await pool.open({ id: "p2", title: "Gas", goal: 10 })).toEqual({
      ok: false,
      message: "A pool is already open.",
    })
    await pool.close("done")
    expect((await pool.open({ id: "p2", title: "Gas", goal: 10 })).ok).toBe(true)
  })

  it("debits pledges immediately and reports the goal", async () => {
    const { pool, balances, game } = setup()
    await pool.open({ id: "p1", title: "Gas", goal: 10 })
    const first = await pool.pledge("a", 4, { username: "Ann" })
    expect(first).toMatchObject({ ok: true, goalMet: false })
    const second = await pool.pledge("b", 6.9)
    expect(second).toMatchObject({ ok: true, goalMet: true })
    expect(balances).toEqual({ a: 96, b: 94 })
    expect(game.addScore).toHaveBeenCalledWith("a", "coin", -4, "trip:pledge", { intent: "exact" })
    expect((await pool.read())?.raised).toBe(10)
  })

  it("refuses bad amounts, short wallets, frozen wallets, closed and wrong pools", async () => {
    const { pool, balances } = setup({ a: 3, frozen: 100 }, ["frozen"])
    expect(await pool.pledge("a", 1)).toMatchObject({
      ok: false,
      message: "Nothing is open to pledge to.",
    })
    await pool.open({ id: "p1", title: "Gas", goal: 10, closesAt: Date.now() + 60_000 })
    expect(await pool.pledge("a", 0)).toMatchObject({
      ok: false,
      message: "Pledge at least 1 coin.",
    })
    expect(await pool.pledge("a", 5)).toMatchObject({
      ok: false,
      message: "You don't have enough coin.",
    })
    expect((await pool.pledge("frozen", 5)).ok).toBe(false)
    expect(await pool.pledge("a", 1, { poolId: "other" })).toMatchObject({ ok: false })
    expect(balances.frozen).toBe(100)
  })

  it("refuses pledges after closesAt", async () => {
    const { pool } = setup()
    await pool.open({ id: "p1", title: "Gas", goal: 10, closesAt: Date.now() - 1 })
    expect(await pool.pledge("a", 1)).toEqual({ ok: false, message: "Pledging has closed." })
  })

  it("retries a lost CAS without charging twice", async () => {
    const { pool, balances, mem } = setup()
    await pool.open({ id: "p1", title: "Gas", goal: 10 })
    const real = mem.raw.compareAndSet.getMockImplementation()!
    mem.raw.compareAndSet.mockImplementationOnce(async () => false)
    mem.raw.compareAndSet.mockImplementation(real)
    expect((await pool.pledge("a", 5)).ok).toBe(true)
    expect(balances.a).toBe(95)
    expect((await pool.read())?.pledges).toHaveLength(1)
  })

  it("rolls the pledge back when the debit doesn't land", async () => {
    const { pool, game } = setup()
    await pool.open({ id: "p1", title: "Gas", goal: 10 })
    game.addScore.mockImplementationOnce(async () => 100)
    expect(await pool.pledge("a", 5)).toEqual({
      ok: false,
      message: "Could not deduct coin for this pledge.",
    })
    expect(await pool.read()).toMatchObject({ raised: 0, pledges: [] })
  })

  it("closes once and reports what was raised", async () => {
    const { pool } = setup()
    await pool.open({ id: "p1", title: "Gas", goal: 10 })
    await pool.pledge("a", 3)
    const closed = await pool.close("deadline")
    expect(closed).toMatchObject({
      raised: 3,
      pool: { status: "closed", closedReason: "deadline" },
    })
    expect(await pool.close("again")).toBeNull()
    expect(await pool.pledge("b", 1)).toMatchObject({ ok: false })
  })

  it("refunds every pledge except frozen backers, then clears", async () => {
    const { pool, balances, game } = setup({ a: 100, b: 100 })
    await pool.open({ id: "p1", title: "Gas", goal: 10 })
    await pool.pledge("a", 3)
    await pool.pledge("b", 4)
    game.getUserState.mockImplementation(async (userId: string) => ({
      userId,
      attributes: { coin: balances[userId] ?? 0, score: 0 },
      modifiers: userId === "b" ? [lockedModifier()] : [],
    }))
    expect(await pool.refundAll()).toEqual({ claimed: true, refunded: 3, blocked: ["b"] })
    expect(balances.a).toBe(100)
    expect(await pool.read()).toBeNull()
  })

  it("never refunds a pool that was already settled", async () => {
    const { pool, balances } = setup({ a: 100 })
    await pool.open({ id: "p1", title: "Gas", goal: 10 })
    await pool.pledge("a", 6)
    expect(await pool.close("funded", { poolId: "p1" })).not.toBeNull()
    // A racing failure path, or a stale pool found before reuse:
    expect(await pool.refundAll()).toEqual({ claimed: false, refunded: 0, blocked: [] })
    expect(balances.a).toBe(94)
  })

  it("refunds a pool only once when two refunds race", async () => {
    const { pool, balances } = setup({ a: 100 })
    await pool.open({ id: "p1", title: "Gas", goal: 10 })
    await pool.pledge("a", 6)
    const [first, second] = await Promise.all([pool.refundAll(), pool.refundAll()])
    expect([first.claimed, second.claimed].sort()).toEqual([false, true])
    expect(balances.a).toBe(100)
  })

  it("only refunds the named pool", async () => {
    const { pool, balances } = setup({ a: 100 })
    await pool.open({ id: "p1", title: "Gas", goal: 10 })
    await pool.pledge("a", 6)
    expect((await pool.refundAll({ poolId: "other" })).claimed).toBe(false)
    expect(balances.a).toBe(94)
  })

  it("keeps the pledge when a concurrent credit lands with the debit", async () => {
    const { pool, game, balances } = setup({ a: 100 })
    await pool.open({ id: "p1", title: "Gas", goal: 10 })
    game.addScore.mockImplementationOnce(async (userId: string, _attr: string, amount: number) => {
      balances[userId] = (balances[userId] ?? 0) + amount + 10 // someone tipped them at the same moment
      return balances[userId]!
    })
    expect((await pool.pledge("a", 5)).ok).toBe(true)
    expect(await pool.read()).toMatchObject({ raised: 5 })
  })
})

describe("helpers", () => {
  it("ranks top contributors by total", () => {
    expect(
      topContributors({
        pledges: [
          { id: "1", userId: "a", username: "Ann", amount: 2, at: 0 },
          { id: "2", userId: "b", amount: 5, at: 0 },
          { id: "3", userId: "a", username: "Ann", amount: 4, at: 0 },
        ],
      }),
    ).toEqual([
      { userId: "a", name: "Ann", amount: 6 },
      { userId: "b", name: "Someone", amount: 5 },
    ])
  })

  it("detects an active coin lock", () => {
    expect(
      hasActiveCoinLock({
        userId: "u",
        attributes: { coin: 1, score: 0 },
        modifiers: [lockedModifier()],
      }),
    ).toBe(true)
    expect(
      hasActiveCoinLock({ userId: "u", attributes: { coin: 1, score: 0 }, modifiers: [] }),
    ).toBe(false)
  })
})

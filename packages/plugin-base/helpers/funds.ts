import type {
  GameSessionPluginAPI,
  GameStateModifier,
  PluginStorage,
  UserGameState,
} from "@repo/types"

/**
 * Shared coin funds (ADR 0204): a proportional levy (`collectShares`) and a
 * voluntary escrow pool (`EscrowPoolHelper`). Neither pays anyone out; callers
 * decide what a raised or collected amount buys.
 */

// ---------------------------------------------------------------------------
// Coin lock
// ---------------------------------------------------------------------------

export function modifierLocksCoin(modifier: GameStateModifier, now: number): boolean {
  if (modifier.startAt > now || modifier.endAt <= now) return false
  return modifier.effects.some((e) => e.type === "lock" && e.target === "coin")
}

/** True when the user has an active `lock` effect on `coin` (e.g. Frozen Assets). */
export function hasActiveCoinLock(
  state: UserGameState | null | undefined,
  now = Date.now(),
): boolean {
  if (!state?.modifiers?.length) return false
  return state.modifiers.some((m) => modifierLocksCoin(m, now))
}

function coinBalance(state: UserGameState | null | undefined): number {
  return Math.max(0, Math.floor(state?.attributes?.coin ?? 0))
}

/**
 * Whether an exact debit landed. `addScore` applies a delta whole or not at
 * all (a lock returns the unchanged value), so any change means it landed.
 * Comparing against `before - amount` instead would misread a concurrent
 * credit or spend as a failed debit and lose track of coins already taken.
 */
function debitLanded(before: number, after: number): boolean {
  return after !== before
}

// ---------------------------------------------------------------------------
// Proportional levy
// ---------------------------------------------------------------------------

export type CoinShare = { userId: string; amount: number }

/**
 * Split `cost` so everyone pays the same share of their balance (D16). Shares
 * round down, then the leftover coins go to the largest fractional parts, so
 * the total is exactly `min(cost, Σ balances)` and nobody pays more than they
 * hold. Results are in input order. Pure.
 */
export function splitProportional(
  cost: number,
  balances: { userId: string; balance: number }[],
): CoinShare[] {
  const clean = balances.map((b) => ({
    userId: b.userId,
    balance: Math.max(0, Math.floor(b.balance)),
  }))
  const total = clean.reduce((sum, b) => sum + b.balance, 0)
  const target = Math.min(Math.max(0, Math.floor(cost)), total)
  if (target === 0) return clean.map((b) => ({ userId: b.userId, amount: 0 }))

  const raw = clean.map((b, index) => {
    const exact = (b.balance * target) / total
    return {
      index,
      floor: Math.floor(exact),
      fraction: exact - Math.floor(exact),
      balance: b.balance,
    }
  })
  let leftover = target - raw.reduce((sum, r) => sum + r.floor, 0)
  const byFraction = [...raw].sort(
    (a, b) => b.fraction - a.fraction || b.balance - a.balance || a.index - b.index,
  )
  for (const entry of byFraction) {
    if (leftover <= 0) break
    if (entry.fraction <= 0) continue
    entry.floor += 1
    leftover -= 1
  }
  return raw.map((r) => ({ userId: clean[r.index]!.userId, amount: r.floor }))
}

export type CollectSharesResult = {
  collected: number
  /** `cost − collected`: the room couldn't cover it, or balances moved before the debit. */
  shortfall: number
  /** Share of each payer's balance taken, 0–1. */
  rate: number
  /** Payers charged a non-zero amount, with what was actually debited. */
  perUser: CoinShare[]
}

/**
 * Charge `payers` a proportional levy (D16). Users without session state or
 * with a coin lock are left out of both the split and the total. Each payer is
 * debited `min(share, current balance)` with `intent: "exact"`; anything spent
 * in between counts as shortfall, with no second pass.
 */
export async function collectShares(
  game: Pick<GameSessionPluginAPI, "getUserState" | "addScore">,
  params: {
    cost: number
    /** `addScore` reason, e.g. `"road-trip:gas"`. */
    reason: string
    payers: string[]
    isExempt?: (userId: string, state: UserGameState) => boolean | Promise<boolean>
  },
): Promise<CollectSharesResult> {
  const cost = Math.max(0, Math.floor(params.cost))
  const now = Date.now()
  // Payers are independent, so their reads (and debits below) run concurrently.
  const candidates = await Promise.all(
    Array.from(new Set(params.payers)).map(async (userId) => {
      const state = await game.getUserState(userId)
      if (!state || hasActiveCoinLock(state, now)) return null
      if (params.isExempt && (await params.isExempt(userId, state))) return null
      return { userId, balance: coinBalance(state) }
    }),
  )
  const balances = candidates.filter((c): c is { userId: string; balance: number } => c !== null)
  const total = balances.reduce((sum, b) => sum + b.balance, 0)
  const rate = total > 0 ? Math.min(1, cost / total) : 0

  const debited = await Promise.all(
    splitProportional(cost, balances).map(async (share): Promise<CoinShare | null> => {
      if (share.amount <= 0) return null
      // Re-read right before the debit: charge at the latest balance (D16).
      const before = coinBalance(await game.getUserState(share.userId))
      const debit = Math.min(share.amount, before)
      if (debit <= 0) return null
      const after = await game.addScore(share.userId, "coin", -debit, params.reason, {
        intent: "exact",
      })
      return debitLanded(before, after) ? { userId: share.userId, amount: debit } : null
    }),
  )
  const perUser = debited.filter((p): p is CoinShare => p !== null)
  const collected = perUser.reduce((sum, p) => sum + p.amount, 0)
  return { collected, shortfall: Math.max(0, cost - collected), rate, perUser }
}

// ---------------------------------------------------------------------------
// Escrow pool
// ---------------------------------------------------------------------------

export type EscrowPledge = {
  /** Row id, so a failed debit can remove exactly its own pledge. */
  id: string
  userId: string
  username?: string
  amount: number
  at: number
}

export type EscrowPoolState = {
  id: string
  title: string
  goal: number
  openedAt: number
  /** Pledges are refused after this time; null = no deadline. */
  closesAt: number | null
  status: "open" | "closed"
  raised: number
  pledges: EscrowPledge[]
  closedAt?: number
  closedReason?: string
}

export type EscrowPoolOptions = {
  /** Plugin storage key for the pool record. */
  key: string
  /** `addScore` reason prefix; pledges use `<reason>:pledge`, refunds `<reason>:refund`. */
  reason?: string
}

export type PledgeResult =
  | { ok: true; pool: EscrowPoolState; goalMet: boolean }
  | { ok: false; message: string }

/** CAS retries when concurrent pledges collide. */
const PLEDGE_CAS_MAX_ATTEMPTS = 8

/**
 * Voluntary escrow (ADR 0204, extracted from Kickstarter / ADR 0188). Pledges
 * debit immediately with `intent: "exact"`, are recorded with CAS, and are
 * rolled back if the debit didn't land (coin lock, race). The pool never pays
 * out: `close` reports what was raised, `refundAll` returns it.
 */
export class EscrowPoolHelper {
  private readonly key: string
  private readonly reason: string

  constructor(
    private readonly deps: {
      storage: PluginStorage
      game: Pick<GameSessionPluginAPI, "getUserState" | "addScore">
    },
    options: EscrowPoolOptions,
  ) {
    this.key = options.key
    this.reason = options.reason ?? options.key
  }

  async read(): Promise<EscrowPoolState | null> {
    return (await this.deps.storage.getJson<EscrowPoolState>(this.key)).value
  }

  /** Open a pool. Fails while another pool at this key is still open. */
  async open(params: {
    id: string
    title: string
    goal: number
    closesAt?: number | null
  }): Promise<{ ok: true; pool: EscrowPoolState } | { ok: false; message: string }> {
    const goal = Math.floor(params.goal)
    if (!Number.isFinite(goal) || goal < 1)
      return { ok: false, message: "Goal must be at least 1 coin." }
    const { raw, value } = await this.deps.storage.getJson<EscrowPoolState>(this.key)
    if (value?.status === "open") return { ok: false, message: "A pool is already open." }
    const pool: EscrowPoolState = {
      id: params.id,
      title: params.title,
      goal,
      openedAt: Date.now(),
      closesAt: params.closesAt ?? null,
      status: "open",
      raised: 0,
      pledges: [],
    }
    const saved = await this.deps.storage.compareAndSet(this.key, raw, JSON.stringify(pool))
    return saved ? { ok: true, pool } : { ok: false, message: "A pool is already open." }
  }

  async pledge(
    userId: string,
    amount: number,
    options: { username?: string; poolId?: string } = {},
  ): Promise<PledgeResult> {
    const coins = Math.floor(amount)
    if (!Number.isFinite(coins) || coins < 1)
      return { ok: false, message: "Pledge at least 1 coin." }

    for (let attempt = 0; attempt < PLEDGE_CAS_MAX_ATTEMPTS; attempt++) {
      const { raw, value: pool } = await this.deps.storage.getJson<EscrowPoolState>(this.key)
      const now = Date.now()
      if (!pool || pool.status !== "open" || (options.poolId && pool.id !== options.poolId)) {
        return { ok: false, message: "Nothing is open to pledge to." }
      }
      if (pool.closesAt !== null && now >= pool.closesAt) {
        return { ok: false, message: "Pledging has closed." }
      }
      const state = await this.deps.game.getUserState(userId)
      if (hasActiveCoinLock(state, now)) {
        return { ok: false, message: "Your assets are frozen — you can't pledge right now." }
      }
      const before = coinBalance(state)
      if (before < coins) return { ok: false, message: "You don't have enough coin." }

      const pledge: EscrowPledge = {
        id: crypto.randomUUID(),
        userId,
        amount: coins,
        at: now,
        ...(options.username ? { username: options.username } : {}),
      }
      const next: EscrowPoolState = {
        ...pool,
        pledges: [...pool.pledges, pledge],
        raised: pool.raised + coins,
      }
      if (!(await this.deps.storage.compareAndSet(this.key, raw, JSON.stringify(next)))) continue

      const after = await this.deps.game.addScore(userId, "coin", -coins, `${this.reason}:pledge`, {
        intent: "exact",
      })
      if (!debitLanded(before, after)) {
        await this.removePledge(pledge.id)
        return { ok: false, message: "Could not deduct coin for this pledge." }
      }
      return { ok: true, pool: next, goalMet: next.raised >= next.goal }
    }
    return { ok: false, message: "Could not record your pledge — please try again." }
  }

  /**
   * Close the open pool and report what it raised. Returns null when there is
   * no open pool (or `poolId` doesn't match), so only the first closer settles.
   */
  async close(
    reason: string,
    options: { poolId?: string } = {},
  ): Promise<{ pool: EscrowPoolState; raised: number; pledges: EscrowPledge[] } | null> {
    const pool = await this.mutate((prev) => {
      if (prev.status !== "open" || (options.poolId && prev.id !== options.poolId)) return null
      return { ...prev, status: "closed", closedAt: Date.now(), closedReason: reason }
    })
    return pool ? { pool, raised: pool.raised, pledges: pool.pledges } : null
  }

  /**
   * Return every pledge of an **open** pool and delete it. The pool is claimed
   * first (closed with reason `"refund"` in one CAS), so a pool that another
   * caller already settled or refunded is never refunded again. Coin-locked
   * backers can't be credited and are reported in `blocked`.
   *
   * @returns `claimed: false` when there was no open pool to refund (or `poolId` didn't match).
   */
  async refundAll(
    options: { poolId?: string } = {},
  ): Promise<{ claimed: boolean; refunded: number; blocked: string[] }> {
    const pool = await this.mutate((prev) => {
      if (prev.status !== "open" || (options.poolId && prev.id !== options.poolId)) return null
      return { ...prev, status: "closed", closedAt: Date.now(), closedReason: "refund" }
    })
    if (!pool) return { claimed: false, refunded: 0, blocked: [] }
    let refunded = 0
    const blocked: string[] = []
    for (const pledge of pool.pledges) {
      const state = await this.deps.game.getUserState(pledge.userId)
      if (hasActiveCoinLock(state)) {
        blocked.push(pledge.userId)
        continue
      }
      await this.deps.game.addScore(pledge.userId, "coin", pledge.amount, `${this.reason}:refund`, {
        intent: "exact",
      })
      refunded += pledge.amount
    }
    await this.clear(pool.id)
    return { claimed: true, refunded, blocked }
  }

  /** Delete the pool record; with `poolId`, only if it's still that pool (a newer one is kept). */
  async clear(poolId?: string): Promise<void> {
    if (poolId !== undefined) {
      const current = await this.read()
      if (current && current.id !== poolId) return
    }
    await this.deps.storage.del(this.key)
  }

  private async removePledge(pledgeId: string): Promise<void> {
    await this.mutate((prev) => {
      const pledge = prev.pledges.find((p) => p.id === pledgeId)
      if (!pledge) return null
      return {
        ...prev,
        pledges: prev.pledges.filter((p) => p.id !== pledgeId),
        raised: Math.max(0, prev.raised - pledge.amount),
      }
    })
  }

  /** CAS read-modify-write that skips the write when `fn` returns null (or there's no pool). */
  private async mutate(
    fn: (prev: EscrowPoolState) => EscrowPoolState | null,
  ): Promise<EscrowPoolState | null> {
    for (let attempt = 0; attempt < PLEDGE_CAS_MAX_ATTEMPTS; attempt++) {
      const { raw, value } = await this.deps.storage.getJson<EscrowPoolState>(this.key)
      if (!value) return null
      const next = fn(value)
      if (!next) return null
      if (await this.deps.storage.compareAndSet(this.key, raw, JSON.stringify(next))) return next
    }
    return null
  }
}

/** Biggest backers by total pledged, for pool cards. */
export function topContributors(
  pool: Pick<EscrowPoolState, "pledges">,
  limit = 3,
): { userId: string; name: string; amount: number }[] {
  const totals = new Map<string, { userId: string; name: string; amount: number }>()
  for (const pledge of pool.pledges) {
    const entry = totals.get(pledge.userId) ?? {
      userId: pledge.userId,
      name: pledge.username ?? "Someone",
      amount: 0,
    }
    entry.amount += pledge.amount
    if (pledge.username) entry.name = pledge.username
    totals.set(pledge.userId, entry)
  }
  return Array.from(totals.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
}

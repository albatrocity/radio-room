import type { GameSessionPluginAPI, PluginActionInitiator, PluginContext } from "@repo/types"
import {
  collectShares,
  topContributors,
  type EscrowPoolHelper,
  type EscrowPoolState,
} from "@repo/plugin-base"
import { FUND_PURPOSE_LABELS, formatShare } from "@repo/road-trip-map"
import { LEVY_RETRY_MS, LEVY_STALE_MS } from "./helpers"
import type { FundPayment, TripFund, TripState } from "./state"
import type { TripStorage } from "./store"
import {
  extendFundHold,
  recordLevy,
  resolveFund,
  startLevy,
  type FundOutcome,
  type Transition,
} from "./transitions"

export type FundActionResult = { success: boolean; message?: string }

/**
 * Coin I/O for an open trip fund (ADR 0217). The plugin keeps the CAS loop
 * (`mutateTrip` / `settle`) and calls in here once a transition has opened,
 * settled, or waived a fund.
 */
export type TripFundHostDeps = {
  getContext: () => PluginContext | null
  trips: () => TripStorage
  pool: () => EscrowPoolHelper
  game: () => Pick<GameSessionPluginAPI, "getUserState" | "addScore">
  mutateTrip: (transition: Transition) => Promise<TripState | null>
  forTrip: (tripId: string, transition: Transition) => Transition
  usernames: (userIds: string[]) => Promise<Map<string, string>>
  settle: () => Promise<void>
}

/** A closed pool's totals, per backer and in all. */
function poolOutcome(pool: EscrowPoolState | null): FundOutcome {
  if (!pool) return { collected: 0, payers: 0 }
  const paid = topContributors(pool, Number.MAX_SAFE_INTEGER)
  return {
    collected: pool.raised,
    payers: paid.length,
    topContributors: paid.slice(0, 3),
    paid,
  }
}

export class TripFundHost {
  constructor(private readonly deps: TripFundHostDeps) {}

  /** Runs once, after the CAS that opened the fund step. */
  async openFund(fund: TripFund, title: string, tripId: string): Promise<void> {
    const context = this.deps.getContext()
    if (!context) return
    if (fund.mode === "voluntary") {
      const opened = await this.deps.pool().open({
        id: fund.id,
        title,
        goal: fund.cost,
        closesAt: fund.endsAt,
      })
      if (!opened.ok)
        console.warn(`[road-trip] ${fund.purpose} pool didn't open: ${opened.message}`)
      return
    }
    const { api, roomId } = context
    // Claim the fund before any coin moves. If it was settled or waived first, charge nobody.
    if (!(await this.deps.mutateTrip(this.deps.forTrip(tripId, startLevy(fund.id))))) return
    const payers = await api.getOnlineUserIds(roomId)
    const result = await collectShares(this.deps.game(), {
      cost: fund.cost,
      reason: `road-trip:${fund.purpose}`,
      payers,
    })
    const names = await this.deps.usernames(result.perUser.map((p) => p.userId))
    const paid: FundPayment[] = result.perUser.map((p) => ({
      ...p,
      name: names.get(p.userId) ?? "Someone",
    }))
    const rate = formatShare(result.rate)
    const label = FUND_PURPOSE_LABELS[fund.purpose]
    await Promise.all(
      paid.map((payment) =>
        api.sendUserSystemMessage(
          roomId,
          payment.userId,
          `${label} took ${rate} of everyone's wallet. Your share: ${payment.amount} coin${payment.amount === 1 ? "" : "s"}.`,
          {
            type: "alert",
            status: "info",
            title: "Road Trip",
            theme: "road-trip",
            icon: fund.purpose === "gas" ? "⛽" : "🧾",
          },
        ),
      ),
    )
    await this.deps.mutateTrip(
      this.deps.forTrip(
        tripId,
        recordLevy(fund.id, {
          collected: result.collected,
          payers: paid.length,
          rate: result.rate,
          paid,
        }),
      ),
    )
  }

  /**
   * Settle the open fund step: close the pool (voluntary) or use the recorded
   * levy (automatic), then fill up. Safe to call twice: `close` settles once
   * and `resolveFund` is idempotent on the fund id.
   */
  async settleOpenFund(fundId?: string): Promise<boolean> {
    const state = await this.deps.trips().readState()
    const fund = state?.fund
    if (!state || !fund || (fundId !== undefined && fund.id !== fundId)) return false
    let outcome: FundOutcome
    if (fund.mode === "voluntary") {
      const closed = await this.deps.pool().close("settled", { poolId: fund.id })
      // Already closed: a retry of our own settle uses the record; a host waive owns a refund.
      const pool = closed?.pool ?? (await this.deps.pool().read())
      if (!closed && pool?.id === fund.id && pool.closedReason === "refund") return false
      outcome = poolOutcome(pool?.id === fund.id ? pool : null)
    } else if (fund.levyStartedAt !== undefined && fund.collected === undefined) {
      // The levy is still debiting (or recording). Never settle it as "0 collected".
      if (Date.now() - fund.levyStartedAt < LEVY_STALE_MS) {
        await this.deps.mutateTrip(
          this.deps.forTrip(state.tripId, extendFundHold(fund.id, Date.now() + LEVY_RETRY_MS)),
        )
        return false
      }
      console.error(
        `[road-trip] levy for ${fund.id} never recorded in ${this.deps.getContext()?.roomId}; settling without it`,
      )
      outcome = { collected: 0, payers: 0, abandonLevy: true }
    } else {
      outcome = {
        collected: fund.collected ?? 0,
        payers: fund.payers ?? 0,
        ...(fund.paid ? { paid: fund.paid } : {}),
      }
    }
    const saved = await this.deps.mutateTrip(
      this.deps.forTrip(state.tripId, resolveFund(fund.id, outcome)),
    )
    return saved !== null
  }

  /** Anyone in the room can chip in while a voluntary gas pool is open (D17). */
  async chipIn(
    initiator: PluginActionInitiator | undefined,
    params: Record<string, unknown> | undefined,
  ): Promise<FundActionResult> {
    const userId = initiator?.userId
    if (!userId) return { success: false, message: "Sign in to chip in." }
    const state = await this.deps.trips().readState()
    const fund = state?.fund
    if (!state || !fund || fund.mode !== "voluntary") {
      return { success: false, message: "There's nothing to chip in for right now." }
    }
    const amount = Number(params?.amount)
    const result = await this.deps.pool().pledge(userId, amount, {
      poolId: fund.id,
      ...(initiator?.username ? { username: initiator.username } : {}),
    })
    if (!result.ok) return { success: false, message: result.message }
    if (result.goalMet) await this.settleOpenFund(fund.id)
    else await this.deps.settle()
    return {
      success: true,
      message: result.goalMet
        ? fund.purpose === "gas"
          ? "That covers it. Filling up!"
          : "That covers it!"
        : `Thanks! ${result.pool.raised} / ${result.pool.goal} coins.`,
    }
  }

  /**
   * Host waives the open incident fund (Quick Access "Skip incident step"):
   * pledges or levy shares go back, then the incident moves on as if paid.
   * Refused while an automatic levy is still being collected.
   */
  async waiveIncidentFund(state: TripState, fund: TripFund): Promise<FundActionResult> {
    if (
      fund.mode === "automatic" &&
      fund.levyStartedAt !== undefined &&
      fund.collected === undefined
    ) {
      return { success: false, message: "Still collecting. Try again in a moment." }
    }
    if (fund.mode === "voluntary") {
      // Claim the pool first: if its deadline already settled it, the coins were spent.
      const refund = await this.deps.pool().refundAll({ poolId: fund.id })
      if (!refund.claimed) {
        return { success: false, message: "Too late: that fund was already settled." }
      }
    } else {
      for (const payment of fund.paid ?? []) {
        if (payment.amount > 0) {
          await this.deps
            .game()
            .addScore(payment.userId, "coin", payment.amount, `road-trip:${fund.purpose}:refund`, {
              intent: "exact",
            })
        }
      }
    }
    const saved = await this.deps.mutateTrip(
      this.deps.forTrip(
        state.tripId,
        resolveFund(fund.id, { collected: 0, payers: 0, waived: true }),
      ),
    )
    return saved
      ? { success: true, message: `${FUND_PURPOSE_LABELS[fund.purpose]} waived and refunded.` }
      : { success: false, message: "Couldn't waive it." }
  }
}

import type { PollPresentation, PoolCardView } from "@repo/types"
import { topContributors, type EscrowPoolState } from "@repo/plugin-base"
import { FUND_PURPOSE_LABELS, type SkipDefault, type TripMap, type TripSite } from "@repo/road-trip-map"
import type { TripFund } from "./trip/state"

/**
 * Road-sign skip poll (M7). A low-fuel gas site is a `warning` service sign
 * whose eyebrow carries the urgent banner ("⛽ 12% · last gas for 20 mi").
 */
export function skipPollPresentation(
  site: TripSite,
  mystery: boolean,
  skipDefault: SkipDefault,
  urgency: string | null = null,
): PollPresentation {
  const eyebrow = urgency ?? (mystery ? undefined : `EXIT ${Math.round(site.mile)}`)
  return {
    theme: "road-trip",
    variant: urgency ? "warning" : "info",
    ...(eyebrow ? { eyebrow } : {}),
    headline: mystery ? "SOMETHING UP AHEAD" : site.name.toUpperCase().slice(0, 80),
    icon: mystery ? "❓" : site.icon,
    ...(!mystery && site.imageUrl ? { imageUrl: site.imageUrl } : {}),
    footnote: skipDefault === "stop" ? "No votes = pull off" : "No votes = keep driving",
    resultsInChat: true,
  }
}

/** Voluntary trip pool (gas or an incident cost) as the shared `pool-card` renders it (D17). */
export function poolCardView(pool: EscrowPoolState, fund: TripFund, map: TripMap): PoolCardView {
  const site = map.sites.find((s) => s.id === fund.siteId)
  const gal = Math.round(fund.gallons * 10) / 10
  const label = FUND_PURPOSE_LABELS[fund.purpose]
  const copy =
    fund.purpose === "gas"
      ? {
          icon: "⛽",
          subtitle: `${gal} gal at ${site?.name ?? "the station"}`,
          body: "The van fills up either way. Chip in so the attendant isn't left short.",
        }
      : {
          icon: fund.purpose === "tow" ? "🚚" : fund.purpose === "delivery" ? "⛽" : "🔧",
          subtitle: `${label} · ${fund.provider ?? "the mechanic"}`,
          body: "The job gets done either way. Chip in so nobody's left short.",
        }
  return {
    id: pool.id,
    title: pool.title,
    icon: copy.icon,
    eyebrow: `Road Trip · ${label} money`,
    subtitle: copy.subtitle,
    body: copy.body,
    goal: pool.goal,
    raised: pool.raised,
    startedAt: pool.openedAt,
    endsAt: pool.closesAt,
    open: pool.status === "open" && (pool.closesAt === null || pool.closesAt > Date.now()),
    topContributors: topContributors(pool).map(({ name, amount }) => ({ name, amount })),
  }
}

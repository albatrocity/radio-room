import type { TrackStatsDTO } from "@repo/types"

export type TrackStatsAggregateRow = {
  showId: string
  showTitle: string
  addedAt: Date | null
  playedAt: Date | null
  showStartTime: Date
  addedByUsername: string | null
}

const UNKNOWN_DJ = "Unknown DJ"

function rowTimestamp(row: TrackStatsAggregateRow): number {
  const ts = row.addedAt ?? row.playedAt ?? row.showStartTime
  return ts.getTime()
}

function toIso(row: TrackStatsAggregateRow): string {
  const ts = row.addedAt ?? row.playedAt ?? row.showStartTime
  return ts.toISOString()
}

function djLabel(username: string | null): string {
  const trimmed = username?.trim()
  return trimmed ? trimmed : UNKNOWN_DJ
}

export function aggregateTrackStats(rows: TrackStatsAggregateRow[]): TrackStatsDTO {
  if (rows.length === 0) {
    return {
      firstPlay: true,
      showCount: 0,
      appearanceCount: 0,
      firstAppearance: null,
      recentAppearances: [],
      topDjs: [],
    }
  }

  const showIds = new Set(rows.map((r) => r.showId))
  const showCount = showIds.size
  const appearanceCount = rows.length

  const byTimeAsc = [...rows].sort((a, b) => rowTimestamp(a) - rowTimestamp(b))
  const earliest = byTimeAsc[0]!

  const byTimeDesc = [...rows].sort((a, b) => rowTimestamp(b) - rowTimestamp(a))
  const recentAppearances: TrackStatsDTO["recentAppearances"] = []
  const seenShows = new Set<string>()
  for (const row of byTimeDesc) {
    if (seenShows.has(row.showId)) continue
    seenShows.add(row.showId)
    recentAppearances.push({
      showTitle: row.showTitle,
      addedByUsername: djLabel(row.addedByUsername),
      addedAt: toIso(row),
    })
    if (recentAppearances.length >= 5) break
  }

  const djCounts = new Map<string, number>()
  for (const row of rows) {
    const label = djLabel(row.addedByUsername)
    djCounts.set(label, (djCounts.get(label) ?? 0) + 1)
  }
  const topDjs = [...djCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([username, count]) => ({ username, count }))

  return {
    firstPlay: showCount === 0,
    showCount,
    appearanceCount,
    firstAppearance: {
      showTitle: earliest.showTitle,
      addedAt: toIso(earliest),
    },
    recentAppearances,
    topDjs,
  }
}

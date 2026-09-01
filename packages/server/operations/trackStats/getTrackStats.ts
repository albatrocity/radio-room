import { db, roomPlaylistTrack, show } from "@repo/db"
import { and, asc, count, countDistinct, desc, eq, or, sql } from "drizzle-orm"
import type { AppContext, TrackStatsIdentityQuery, TrackStatsDTO } from "@repo/types"
import { withCachedJson } from "@repo/utils/cachedJson"
import { TRACK_STATS_TTL_SECONDS, trackStatsCacheKey } from "./trackStatsCacheKey"

export class TrackStatsBadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TrackStatsBadRequestError"
  }
}

const UNKNOWN_DJ = "Unknown DJ"

const coalescedTimestamp = sql<Date>`COALESCE(${roomPlaylistTrack.addedAt}, ${roomPlaylistTrack.playedAt}, ${show.startTime})`

const addedByUsernameExpr = sql<string | null>`NULLIF(TRIM(${roomPlaylistTrack.trackPayload} #>> '{addedBy,username}'), '')`

function djLabel(username: string | null | undefined): string {
  const trimmed = username?.trim()
  return trimmed ? trimmed : UNKNOWN_DJ
}

function buildIdentityMatch(identity: TrackStatsIdentityQuery) {
  const conditions = [
    and(
      eq(roomPlaylistTrack.mediaSourceType, identity.mediaSourceType),
      eq(roomPlaylistTrack.mediaSourceTrackId, identity.mediaSourceTrackId),
    ),
  ]
  if (identity.spotifyTrackId) {
    conditions.push(eq(roomPlaylistTrack.spotifyTrackId, identity.spotifyTrackId))
  }
  if (identity.tidalTrackId) {
    conditions.push(eq(roomPlaylistTrack.tidalTrackId, identity.tidalTrackId))
  }
  return or(...conditions)
}

function publishedIdentityWhere(identity: TrackStatsIdentityQuery) {
  return and(eq(show.status, "published"), buildIdentityMatch(identity))
}

function toIso(ts: Date): string {
  return ts.toISOString()
}

async function fetchTrackStatsDto(identity: TrackStatsIdentityQuery): Promise<TrackStatsDTO> {
  const where = publishedIdentityWhere(identity)

  const [countsRow, firstRow, recentRows, topDjRows] = await Promise.all([
    db
      .select({
        appearanceCount: count(),
        showCount: countDistinct(roomPlaylistTrack.showId),
      })
      .from(roomPlaylistTrack)
      .innerJoin(show, eq(roomPlaylistTrack.showId, show.id))
      .where(where),

    db
      .select({
        showTitle: show.title,
        timestamp: coalescedTimestamp,
      })
      .from(roomPlaylistTrack)
      .innerJoin(show, eq(roomPlaylistTrack.showId, show.id))
      .where(where)
      .orderBy(asc(coalescedTimestamp))
      .limit(1),

    db.execute<{
      show_title: string
      added_at: Date
      added_by_username: string
    }>(sql`
      SELECT show_title, added_at, added_by_username
      FROM (
        SELECT DISTINCT ON (${roomPlaylistTrack.showId})
          ${show.title} AS show_title,
          ${coalescedTimestamp} AS added_at,
          ${addedByUsernameExpr} AS added_by_username
        FROM ${roomPlaylistTrack}
        INNER JOIN ${show} ON ${roomPlaylistTrack.showId} = ${show.id}
        WHERE ${where}
        ORDER BY ${roomPlaylistTrack.showId}, ${coalescedTimestamp} DESC
      ) AS newest_per_show
      ORDER BY added_at DESC
      LIMIT 5
    `),

    db
      .select({
        username: addedByUsernameExpr,
        appearanceCount: count(),
      })
      .from(roomPlaylistTrack)
      .innerJoin(show, eq(roomPlaylistTrack.showId, show.id))
      .where(where)
      .groupBy(addedByUsernameExpr)
      .orderBy(desc(count()), asc(addedByUsernameExpr))
      .limit(3),
  ])

  const appearanceCount = Number(countsRow[0]?.appearanceCount ?? 0)
  const showCount = Number(countsRow[0]?.showCount ?? 0)

  if (appearanceCount === 0) {
    return {
      firstPlay: true,
      showCount: 0,
      appearanceCount: 0,
      firstAppearance: null,
      recentAppearances: [],
      topDjs: [],
    }
  }

  const earliest = firstRow[0]
  const recentResult = recentRows as unknown as {
    rows: Array<{ show_title: string; added_at: Date; added_by_username: string }>
  }
  const recent = recentResult.rows ?? recentRows

  return {
    firstPlay: false,
    showCount,
    appearanceCount,
    firstAppearance: earliest
      ? {
          showTitle: earliest.showTitle,
          addedAt: toIso(earliest.timestamp),
        }
      : null,
    recentAppearances: recent.map((row) => ({
      showTitle: row.show_title,
      addedByUsername: djLabel(row.added_by_username),
      addedAt: toIso(row.added_at),
    })),
    topDjs: topDjRows.map((row) => ({
      username: djLabel(row.username),
      count: Number(row.appearanceCount),
    })),
  }
}

export async function getTrackStats(
  context: AppContext,
  identity: TrackStatsIdentityQuery,
): Promise<TrackStatsDTO> {
  const cacheKey = trackStatsCacheKey(identity)
  return withCachedJson({
    cache: context.cache,
    key: cacheKey,
    ttlSeconds: TRACK_STATS_TTL_SECONDS,
    fetch: async () => fetchTrackStatsDto(identity),
  })
}

/** @internal integration tests may stub this path via getTrackStats mock */
export { fetchTrackStatsDto }

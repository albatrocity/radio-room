import { existsSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { normalizeRecordGenres, type LibraryAlbumRow } from "@repo/types"
import { rankAlbumsByRelevance } from "@repo/utils"

/**
 * Read-only Navidrome library from a `navidrome.db` snapshot (ADR 0230).
 * Album ids are `album.id` — the same strings Subsonic returns for that file.
 * Queries touch `album` and `annotation` only.
 */

const LIBRARY_ALBUM_CAP = 2000
const SEARCH_LIMIT = 10

export type NavidromeFileAlbum = {
  id: string
  name: string
  artist: string
  year?: number
  songCount: number
  userRating?: number
  genres?: string[]
}

type AlbumColumns = {
  hasMissing: boolean
  hasMaxYear: boolean
  hasMaxOriginalYear: boolean
  hasYear: boolean
  hasSearchNormalized: boolean
  hasTags: boolean
  hasGenre: boolean
  hasAlbumArtist: boolean
  hasSongCount: boolean
}

type RawAlbumRow = Record<string, unknown>

export class NavidromeLibraryFile {
  private constructor(
    private readonly db: DatabaseSync,
    private readonly columns: AlbumColumns,
  ) {}

  static open(path: string): NavidromeLibraryFile {
    const trimmed = path.trim()
    if (!trimmed) throw new Error("Database path is empty")
    if (!existsSync(trimmed)) throw new Error(`Database not found: ${trimmed}`)

    let db: DatabaseSync
    try {
      db = new DatabaseSync(trimmed, { readOnly: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Could not open Navidrome database (${message}). Copy navidrome.db with its -wal/-shm, or copy after a checkpoint.`,
      )
    }

    try {
      const columns = inspectAlbumColumns(db)
      if (!columns) {
        db.close()
        throw new Error("Database is missing album.id (not a Navidrome library?)")
      }
      return new NavidromeLibraryFile(db, columns)
    } catch (error) {
      try {
        db.close()
      } catch {
        /* already closed or unusable */
      }
      throw error
    }
  }

  close(): void {
    this.db.close()
  }

  albumCount(): number {
    const sql = this.columns.hasMissing
      ? "SELECT COUNT(*) AS n FROM album WHERE NOT missing"
      : "SELECT COUNT(*) AS n FROM album"
    const row = this.db.prepare(sql).get() as { n?: number } | undefined
    return Number(row?.n ?? 0)
  }

  getAlbum(id: string): NavidromeFileAlbum | null {
    const trimmed = id.trim()
    if (!trimmed) return null
    const sql = `${this.selectSql()} WHERE album.id = ?${this.missingClause(" AND")} LIMIT 1`
    const row = this.db.prepare(sql).get(trimmed) as RawAlbumRow | undefined
    return row ? mapRow(row) : null
  }

  searchAlbums(query: string): NavidromeFileAlbum[] {
    const trimmed = query.trim()
    if (!trimmed) return []
    const like = `%${escapeLike(trimmed)}%`
    const parts = ["album.name LIKE ? ESCAPE '\\'"]
    const params: string[] = [like]
    if (this.columns.hasAlbumArtist) {
      parts.push("album.album_artist LIKE ? ESCAPE '\\'")
      params.push(like)
    }
    if (this.columns.hasSearchNormalized) {
      parts.push("album.search_normalized LIKE ? ESCAPE '\\'")
      params.push(like)
    }
    const sql = `${this.selectSql()} WHERE (${parts.join(" OR ")})${this.missingClause(" AND")} LIMIT 200`
    const rows = this.db.prepare(sql).all(...params) as RawAlbumRow[]
    const mapped = rows.map(mapRow).filter((a): a is NavidromeFileAlbum => a != null)
    const ranked = rankAlbumsByRelevance(
      trimmed,
      mapped.map((a) => ({ album: a, title: a.name, artist: a.artist, source: "local" })),
    )
    return ranked.slice(0, SEARCH_LIMIT).map((hit) => hit.album)
  }

  listAlbums(cap: number = LIBRARY_ALBUM_CAP): LibraryAlbumRow[] {
    const limit = Math.max(0, Math.min(cap, LIBRARY_ALBUM_CAP))
    const sql = `${this.selectSql()}${this.missingClause(" WHERE")} ORDER BY album.name COLLATE NOCASE ASC LIMIT ?`
    const rows = this.db.prepare(sql).all(limit) as RawAlbumRow[]
    const out: LibraryAlbumRow[] = []
    for (const row of rows) {
      const album = mapRow(row)
      if (!album) continue
      out.push({
        id: album.id,
        name: album.name,
        ...(album.artist ? { artist: album.artist } : {}),
        ...(album.year ? { year: album.year } : {}),
        ...(album.songCount ? { songCount: album.songCount } : {}),
        ...(album.userRating ? { userRating: album.userRating } : {}),
        ...(album.genres?.length ? { genres: album.genres } : {}),
      })
    }
    return out
  }

  private selectSql(): string {
    const cols = [
      "album.id AS id",
      "album.name AS name",
      this.columns.hasAlbumArtist ? "album.album_artist AS album_artist" : "'' AS album_artist",
      this.columns.hasSongCount ? "album.song_count AS song_count" : "0 AS song_count",
      this.columns.hasGenre ? "album.genre AS genre" : "'' AS genre",
      this.columns.hasTags ? "album.tags AS tags" : "'{}' AS tags",
      this.columns.hasMaxOriginalYear
        ? "album.max_original_year AS max_original_year"
        : "0 AS max_original_year",
      this.columns.hasMaxYear
        ? "album.max_year AS max_year"
        : this.columns.hasYear
          ? "album.year AS max_year"
          : "0 AS max_year",
      `(SELECT MAX(a.rating) FROM annotation a
          WHERE a.item_type = 'album' AND a.item_id = album.id AND a.rating > 0)
         AS user_rating`,
    ]
    return `SELECT ${cols.join(", ")} FROM album`
  }

  private missingClause(prefix: " WHERE" | " AND"): string {
    return this.columns.hasMissing ? `${prefix} NOT album.missing` : ""
  }
}

function inspectAlbumColumns(db: DatabaseSync): AlbumColumns | null {
  let info: { name: string }[]
  try {
    info = db.prepare("PRAGMA table_info(album)").all() as { name: string }[]
  } catch {
    return null
  }
  const names = new Set(info.map((c) => c.name))
  if (!names.has("id") || !names.has("name")) return null
  return {
    hasMissing: names.has("missing"),
    hasMaxYear: names.has("max_year"),
    hasMaxOriginalYear: names.has("max_original_year"),
    hasYear: names.has("year"),
    hasSearchNormalized: names.has("search_normalized"),
    hasTags: names.has("tags"),
    hasGenre: names.has("genre"),
    hasAlbumArtist: names.has("album_artist"),
    hasSongCount: names.has("song_count"),
  }
}

function mapRow(row: RawAlbumRow): NavidromeFileAlbum | null {
  const id = String(row.id ?? "").trim()
  if (!id) return null
  const name = String(row.name ?? id).trim() || id
  const artist = String(row.album_artist ?? "").trim() || "Unknown artist"
  const maxOriginal = Number(row.max_original_year ?? 0)
  const maxYear = Number(row.max_year ?? 0)
  const year = maxOriginal > 0 ? maxOriginal : maxYear > 0 ? maxYear : undefined
  const songCount = Math.max(0, Number(row.song_count ?? 0))
  const rating = Number(row.user_rating ?? 0)
  const genres = genresFromRow(row)
  return {
    id,
    name,
    artist,
    ...(year ? { year } : {}),
    songCount,
    ...(rating > 0 ? { userRating: rating } : {}),
    ...(genres.length > 0 ? { genres } : {}),
  }
}

function genresFromRow(row: RawAlbumRow): string[] {
  const values: unknown[] = []
  const genre = String(row.genre ?? "").trim()
  if (genre) values.push(genre)
  const tagsRaw = row.tags
  if (typeof tagsRaw === "string" && tagsRaw.trim()) {
    try {
      const tags = JSON.parse(tagsRaw) as Record<string, { value?: string }[] | undefined>
      for (const entry of tags.genre ?? []) {
        if (entry?.value) values.push(entry.value)
      }
    } catch {
      /* ignore malformed tags JSON */
    }
  }
  return normalizeRecordGenres(values)
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

export { LIBRARY_ALBUM_CAP as NAVIDROME_FILE_LIBRARY_CAP }

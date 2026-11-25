import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import {
  getRecordLibrarySourceStatus,
  resetRecordLibrarySourceForTests,
  setRecordLibrarySource,
} from "./recordLibrarySource.js"
import { listLibraryAlbums, searchRecords } from "./recordPicks.js"

const ALBUM_ID = "2QImfOd6DtUtk6rQb7v3l4"
const dirs: string[] = []

afterEach(() => {
  resetRecordLibrarySourceForTests()
  while (dirs.length) {
    const dir = dirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function makeDb(): { configPath: string; dbPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "record-lib-src-"))
  dirs.push(dir)
  const dbPath = join(dir, "navidrome.db")
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE album (
      id varchar(255) NOT NULL PRIMARY KEY,
      name varchar(255) NOT NULL DEFAULT '',
      album_artist varchar(255) NOT NULL DEFAULT '',
      max_year INTEGER NOT NULL DEFAULT 0,
      max_original_year INT NOT NULL DEFAULT 0,
      song_count INTEGER NOT NULL DEFAULT 0,
      genre varchar(255) NOT NULL DEFAULT '',
      tags jsonb NOT NULL DEFAULT '{}',
      missing boolean NOT NULL DEFAULT false,
      search_normalized TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE annotation (
      user_id varchar(255) NOT NULL,
      item_id varchar(255) NOT NULL DEFAULT '',
      item_type varchar(255) NOT NULL,
      rating INTEGER DEFAULT 0
    );
  `)
  db.prepare(
    `INSERT INTO album
      (id, name, album_artist, max_year, max_original_year, song_count, genre, tags, missing, search_normalized)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(ALBUM_ID, "Playing It Safe", "Fullbloods", 2024, 0, 2, "", "{}", 0, "playing it safe")
  db.close()
  return { configPath: join(dir, "studio-library.json"), dbPath }
}

describe("recordLibrarySource", () => {
  it("defaults to live and remembers a file path across mode switches", () => {
    const { configPath, dbPath } = makeDb()
    const fileStatus = setRecordLibrarySource({ mode: "file", path: dbPath }, configPath)
    expect(fileStatus).toMatchObject({ mode: "file", path: dbPath, ok: true, albumCount: 1 })

    const liveStatus = setRecordLibrarySource({ mode: "live" }, configPath)
    expect(liveStatus.mode).toBe("live")
    expect(liveStatus.path).toBe(dbPath)

    const again = setRecordLibrarySource({ mode: "file" }, configPath)
    expect(again).toMatchObject({ mode: "file", path: dbPath, ok: true, albumCount: 1 })
  })

  it("leaves the previous source in place when a path is bad", () => {
    const { configPath, dbPath } = makeDb()
    setRecordLibrarySource({ mode: "file", path: dbPath }, configPath)
    expect(() =>
      setRecordLibrarySource({ mode: "file", path: join(tmpdir(), "missing-navidrome.db") }, configPath),
    ).toThrow(/not found/i)
    expect(getRecordLibrarySourceStatus(configPath)).toMatchObject({
      mode: "file",
      path: dbPath,
      ok: true,
      albumCount: 1,
    })
  })

  it("routes search and library through the open file", async () => {
    const { configPath, dbPath } = makeDb()
    setRecordLibrarySource({ mode: "file", path: dbPath }, configPath)
    const search = await searchRecords("Playing")
    const local = search.results.filter((r) => r.source === "local")
    expect(local).toHaveLength(1)
    expect(local[0]?.id).toBe(ALBUM_ID)
    expect(local[0]?.coverUrl).toBeUndefined()

    const albums = await listLibraryAlbums()
    expect(albums).toEqual([
      expect.objectContaining({ id: ALBUM_ID, name: "Playing It Safe", artist: "Fullbloods" }),
    ])
  })

  it("persists mode to disk", () => {
    const { configPath, dbPath } = makeDb()
    setRecordLibrarySource({ mode: "file", path: dbPath }, configPath)
    const saved = JSON.parse(readFileSync(configPath, "utf8")) as { mode: string; path: string }
    expect(saved).toEqual({ mode: "file", path: dbPath })
  })
})

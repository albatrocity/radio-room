import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, describe, expect, it } from "vitest"
import { NavidromeLibraryFile } from "./navidromeLibraryFile.js"

const PLAYING_IT_SAFE_ID = "2QImfOd6DtUtk6rQb7v3l4"
const MBZ_LEAK = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

const dirs: string[] = []

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function fixtureDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "navidrome-file-"))
  dirs.push(dir)
  const path = join(dir, "navidrome.db")
  const db = new DatabaseSync(path)
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
      mbz_album_id varchar NOT NULL DEFAULT '',
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
      (id, name, album_artist, max_year, max_original_year, song_count, genre, tags, missing, mbz_album_id, search_normalized)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    PLAYING_IT_SAFE_ID,
    "Playing It Safe",
    "Fullbloods",
    2024,
    0,
    2,
    "Indie",
    JSON.stringify({ genre: [{ id: "g1", value: "Rock" }], tracktotal: [{ id: "t1", value: "11" }] }),
    0,
    MBZ_LEAK,
    "playing it safe fullbloods",
  )
  db.prepare(
    `INSERT INTO album
      (id, name, album_artist, max_year, max_original_year, song_count, genre, tags, missing, mbz_album_id, search_normalized)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "missingAlbumIdxxxxxxxxxxxx",
    "Gone Album",
    "Nobody",
    1999,
    0,
    1,
    "",
    "{}",
    1,
    "",
    "gone album nobody",
  )
  db.prepare(
    `INSERT INTO annotation (user_id, item_id, item_type, rating) VALUES (?, ?, ?, ?)`,
  ).run("u1", PLAYING_IT_SAFE_ID, "album", 3)
  db.prepare(
    `INSERT INTO annotation (user_id, item_id, item_type, rating) VALUES (?, ?, ?, ?)`,
  ).run("u2", PLAYING_IT_SAFE_ID, "album", 5)
  db.close()
  return path
}

describe("NavidromeLibraryFile", () => {
  it("opens and reports album count, skipping missing", () => {
    const path = fixtureDb()
    const lib = NavidromeLibraryFile.open(path)
    expect(lib.albumCount()).toBe(1)
    lib.close()
  })

  it("getAlbum returns album.id and never mbz_album_id", () => {
    const path = fixtureDb()
    const lib = NavidromeLibraryFile.open(path)
    const album = lib.getAlbum(PLAYING_IT_SAFE_ID)
    expect(album).toEqual({
      id: PLAYING_IT_SAFE_ID,
      name: "Playing It Safe",
      artist: "Fullbloods",
      year: 2024,
      songCount: 2,
      userRating: 5,
      genres: ["Indie", "Rock"],
    })
    expect(JSON.stringify(album)).not.toContain(MBZ_LEAK)
    expect(lib.getAlbum("missingAlbumIdxxxxxxxxxxxx")).toBeNull()
    lib.close()
  })

  it("searchAlbums returns the exact album.id for a title match", () => {
    const path = fixtureDb()
    const lib = NavidromeLibraryFile.open(path)
    const hits = lib.searchAlbums("Playing It Safe")
    expect(hits).toHaveLength(1)
    expect(hits[0]?.id).toBe(PLAYING_IT_SAFE_ID)
    expect(hits[0]?.name).toBe("Playing It Safe")
    lib.close()
  })

  it("listAlbums maps LibraryAlbumRow fields from album.id", () => {
    const path = fixtureDb()
    const lib = NavidromeLibraryFile.open(path)
    expect(lib.listAlbums()).toEqual([
      {
        id: PLAYING_IT_SAFE_ID,
        name: "Playing It Safe",
        artist: "Fullbloods",
        year: 2024,
        songCount: 2,
        userRating: 5,
        genres: ["Indie", "Rock"],
      },
    ])
    lib.close()
  })

  it("rejects a path without album.id", () => {
    const dir = mkdtempSync(join(tmpdir(), "navidrome-bad-"))
    dirs.push(dir)
    const path = join(dir, "empty.db")
    const db = new DatabaseSync(path)
    db.exec("CREATE TABLE album (name TEXT)")
    db.close()
    expect(() => NavidromeLibraryFile.open(path)).toThrow(/album\.id/)
  })

  it("rejects a missing file", () => {
    expect(() => NavidromeLibraryFile.open(join(tmpdir(), "no-such-navidrome.db"))).toThrow(
      /not found/i,
    )
  })
})

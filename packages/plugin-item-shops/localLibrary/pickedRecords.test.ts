import { describe, expect, it } from "vitest"
import type { LibraryAlbumRow, PhysicalMediaPick } from "@repo/types"
import { physicalMediaStockSchema } from "@repo/types"
import { validateRoomShopRequest } from "../roomShop"
import {
  derivePickedRecord,
  normalizeAlbumText,
  pickedRecordShortId,
  resolvePick,
} from "./pickedRecords"

const HARVEST: PhysicalMediaPick = {
  source: "spotify",
  id: "4BRkPBUxOYffM2QXVlq7aC",
  title: "Harvest (2009 Remaster)",
  artist: "Neil Young",
  year: 1972,
  trackCount: 10,
  imageUrl: "https://i.scdn.co/image/harvest",
  lore: "Released 1972 on Reprise.",
}

const NO_OTHER: PhysicalMediaPick = {
  source: "local",
  id: "studio-nd-123",
  title: "No Other",
  artist: "Gene Clark",
  year: 1974,
  trackCount: 8,
}

const library: LibraryAlbumRow[] = [
  { id: "room-nd-9", name: "No Other (Deluxe Edition)", artist: "Gene Clark", year: 2019 },
  { id: "room-nd-7", name: "No Other", artist: "Gene Clark", year: 1974 },
  { id: "room-nd-1", name: "The Notorious Byrd Brothers", artist: "The Byrds", year: 1968 },
]

describe("normalizeAlbumText", () => {
  it("drops case, accents, edition suffixes, and a leading The", () => {
    expect(normalizeAlbumText("Harvest (2009 Remaster)")).toBe("harvest")
    expect(normalizeAlbumText("Harvest - Remastered")).toBe("harvest")
    expect(normalizeAlbumText("The Byrds")).toBe(normalizeAlbumText("Byrds"))
    expect(normalizeAlbumText("Café Tacvba")).toBe("cafetacvba")
    expect(normalizeAlbumText("Live (At Fillmore)")).toBe("liveatfillmore")
  })
})

describe("resolvePick", () => {
  it("uses a Spotify id as is", () => {
    expect(resolvePick(HARVEST, [])).toEqual({ sourceId: "spotify", albumId: HARVEST.id })
  })

  it("matches a local pick by id first", () => {
    expect(resolvePick({ ...NO_OTHER, id: "room-nd-1" }, library)).toEqual({
      sourceId: "local",
      albumId: "room-nd-1",
    })
  })

  it("falls back to artist + title, preferring the matching year", () => {
    expect(resolvePick(NO_OTHER, library)).toEqual({ sourceId: "local", albumId: "room-nd-7" })
    expect(resolvePick({ ...NO_OTHER, year: undefined }, library)?.albumId).toBe("room-nd-9")
  })

  it("matches through a leading The and edition suffixes", () => {
    const pick = {
      ...NO_OTHER,
      id: "x",
      title: "Notorious Byrd Brothers (Remastered)",
      artist: "Byrds",
    }
    expect(resolvePick(pick, library)?.albumId).toBe("room-nd-1")
  })

  it("is null when the library has no match", () => {
    expect(resolvePick({ ...NO_OTHER, id: "x", title: "White Light" }, library)).toBeNull()
  })
})

describe("derivePickedRecord", () => {
  it("builds a Spotify record with its album ref and the designer's lore", () => {
    const ref = { sourceId: "spotify", albumId: HARVEST.id }
    const entry = derivePickedRecord({ pick: HARVEST, ref })
    expect(entry.definition).toMatchObject({
      shortId: `pm-spotify-lp-${HARVEST.id}`,
      name: "LP: Harvest (2009 Remaster)",
      artist: "Neil Young",
      mediaFormat: "LP",
      mediaAlbum: ref,
      imageUrl: HARVEST.imageUrl,
      lore: HARVEST.lore,
      coinValue: 25,
      slotPool: "collection",
    })
    expect(entry.recordAlbum).toEqual(ref)
    expect(entry.localLibraryGrant).toBeUndefined()
  })

  it("gives a local pick the album-scope library grant", () => {
    const ref = { sourceId: "local", albumId: "room-nd-7" }
    const entry = derivePickedRecord({ pick: NO_OTHER, ref })
    expect(entry.localLibraryGrant).toEqual({
      scope: "album",
      albumKey: "pm-local-lp-room-nd-7",
      redemption: "durable",
    })
    expect(entry.recordAlbum).toBeUndefined()
  })

  it("puts the format in the id, so an override makes a distinct SKU", () => {
    const ref = { sourceId: "spotify", albumId: HARVEST.id }
    const cd = derivePickedRecord({ pick: { ...HARVEST, format: "CD" }, ref })
    expect(cd.definition.shortId).toBe(pickedRecordShortId(ref, "CD"))
    expect(cd.definition.name).toBe("CD: Harvest (2009 Remaster)")
  })
})

describe("physicalMediaStockSchema", () => {
  it("accepts picks beside a library filter and caps picks", () => {
    expect(
      physicalMediaStockSchema.safeParse({ library: { genres: ["Country"] }, picks: [HARVEST] })
        .success,
    ).toBe(true)
    expect(
      physicalMediaStockSchema.safeParse({ picks: Array.from({ length: 25 }, () => HARVEST) })
        .success,
    ).toBe(false)
  })
})

describe("validateRoomShopRequest with picks", () => {
  const known = (picks: {
    available: number
    unresolved?: string[]
    unavailable?: Record<string, number>
  }) => ({
    definitionIds: new Set<string>(),
    physicalMedia: {
      derived: 0,
      matching: 0,
      picks: {
        total: 2,
        available: picks.available,
        unresolved: picks.unresolved ?? [],
        unavailableSources: picks.unavailable ?? {},
      },
    },
  })

  it("accepts a picks-only bin, warning about picks that won't stock", () => {
    expect(
      validateRoomShopRequest({ physicalMedia: { picks: [HARVEST] } }, known({ available: 1 })),
    ).toEqual({
      ok: true,
    })
    expect(
      validateRoomShopRequest(
        { physicalMedia: { picks: [HARVEST, NO_OTHER] } },
        known({ available: 0, unresolved: ["Gene Clark – No Other"], unavailable: { spotify: 1 } }),
      ),
    ).toEqual({
      ok: true,
      warnings: [
        "Spotify isn't available in this room; 1 picked record won't stock",
        "Couldn't find Gene Clark – No Other in this room's library",
      ],
    })
  })

  it("skips the no-library warning when picks stock the bin", () => {
    expect(
      validateRoomShopRequest(
        { physicalMedia: { library: {}, picks: [HARVEST] } },
        known({ available: 1 }),
      ),
    ).toEqual({ ok: true })
  })

  it("rejects an empty stock with no offers", () => {
    expect(
      validateRoomShopRequest({ physicalMedia: { picks: [] } }, known({ available: 0 })).ok,
    ).toBe(false)
  })
})

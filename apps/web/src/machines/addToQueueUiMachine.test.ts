import { createActor } from "xstate"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  ADD_TO_QUEUE_UI_STORAGE_PREFIX,
  addToQueueUiMachine,
  browseLocationToNavigation,
  loadAddToQueueUi,
  parseAddToQueueUiState,
  saveAddToQueueUi,
} from "./addToQueueUiMachine"

const ROOM = "room-aq-test"

function installSessionStorageMock() {
  const store = new Map<string, string>()
  const mock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, "sessionStorage", {
    value: mock,
    configurable: true,
    writable: true,
  })
}

describe("addToQueueUiMachine", () => {
  beforeEach(() => {
    installSessionStorageMock()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it("hydrates from sessionStorage on ACTIVATE and restores browse on SET_CAPABILITIES", () => {
    saveAddToQueueUi(ROOM, {
      mode: "browse",
      sourceFilter: "spotify-metadata",
      browse: {
        source: "spotify-metadata",
        rootKind: "artists",
        level: "tracks",
        artistId: "a1",
        artistTitle: "Phil Collins",
        albumId: "al1",
        albumTitle: "Going Back",
      },
    })

    const actor = createActor(addToQueueUiMachine).start()
    actor.send({ type: "ACTIVATE", roomId: ROOM })
    expect(actor.getSnapshot().context.mode).toBe("browse")
    expect(actor.getSnapshot().context.pendingNavigation).toBeNull()

    actor.send({
      type: "SET_CAPABILITIES",
      canBrowse: true,
      browseableSourceIds: ["spotify-metadata"],
      metadataSourceIds: ["spotify-metadata"],
    })

    expect(actor.getSnapshot().context.pendingNavigation).toEqual(
      browseLocationToNavigation({
        source: "spotify-metadata",
        rootKind: "artists",
        level: "tracks",
        artistId: "a1",
        artistTitle: "Phil Collins",
        albumId: "al1",
        albumTitle: "Going Back",
      }),
    )
    expect(actor.getSnapshot().context.ignoreBrowseLocation).toBe(true)
    actor.stop()
  })

  it("persists mode and source changes", () => {
    const actor = createActor(addToQueueUiMachine).start()
    actor.send({ type: "ACTIVATE", roomId: ROOM })
    actor.send({
      type: "SET_CAPABILITIES",
      canBrowse: true,
      browseableSourceIds: ["local", "spotify-metadata"],
      metadataSourceIds: ["spotify-metadata"],
    })
    actor.send({ type: "SET_MODE", mode: "browse" })
    actor.send({ type: "SET_SOURCE", sourceFilter: "local" })

    expect(loadAddToQueueUi(ROOM)).toMatchObject({
      mode: "browse",
      sourceFilter: "local",
    })
    actor.stop()
  })

  it("ignores browse location while restore is pending, then persists after applied", () => {
    saveAddToQueueUi(ROOM, {
      mode: "browse",
      sourceFilter: "local",
      browse: { source: "local", rootKind: "artists", level: "root" },
    })

    const actor = createActor(addToQueueUiMachine).start()
    actor.send({ type: "ACTIVATE", roomId: ROOM })
    actor.send({
      type: "SET_CAPABILITIES",
      canBrowse: true,
      browseableSourceIds: ["local"],
      metadataSourceIds: ["local"],
    })

    actor.send({
      type: "BROWSE_LOCATION",
      location: { source: "local", rootKind: "albums", level: "root" },
    })
    expect(actor.getSnapshot().context.browse?.rootKind).toBe("artists")

    actor.send({ type: "NAVIGATION_APPLIED" })
    actor.send({
      type: "BROWSE_LOCATION",
      location: {
        source: "local",
        rootKind: "artists",
        level: "artistAlbums",
        artistId: "a1",
        artistTitle: "Artist",
      },
    })

    expect(loadAddToQueueUi(ROOM)?.browse).toMatchObject({
      level: "artistAlbums",
      artistId: "a1",
    })
    actor.stop()
  })

  it("deep-link media overrides restore", () => {
    saveAddToQueueUi(ROOM, {
      mode: "search",
      sourceFilter: "all",
      browse: { source: "spotify-metadata", rootKind: "albums", level: "root" },
    })

    const actor = createActor(addToQueueUiMachine).start()
    actor.send({ type: "ACTIVATE", roomId: ROOM })
    actor.send({
      type: "SET_CAPABILITIES",
      canBrowse: true,
      browseableSourceIds: ["local", "spotify-metadata"],
      metadataSourceIds: ["spotify-metadata"],
    })
    actor.send({ type: "DEEP_LINK_MEDIA", mediaKey: "pm-1" })

    expect(actor.getSnapshot().context).toMatchObject({
      mode: "browse",
      sourceFilter: "local",
      pendingNavigation: { source: "local", mediaKey: "pm-1", rootKind: "media" },
    })
    actor.stop()
  })

  it("re-queues browse navigation on RESTORE_BROWSE_VIEW after CatalogBrowse remount", () => {
    const actor = createActor(addToQueueUiMachine).start()
    actor.send({ type: "ACTIVATE", roomId: ROOM })
    actor.send({
      type: "SET_CAPABILITIES",
      canBrowse: true,
      browseableSourceIds: ["spotify-metadata"],
      metadataSourceIds: ["spotify-metadata"],
    })
    actor.send({ type: "SET_MODE", mode: "browse" })
    actor.send({ type: "SET_SOURCE", sourceFilter: "spotify-metadata" })
    actor.send({
      type: "BROWSE_LOCATION",
      location: {
        source: "spotify-metadata",
        rootKind: "albums",
        level: "tracks",
        albumId: "in-utero",
        albumTitle: "In Utero",
      },
    })
    actor.send({ type: "NAVIGATION_APPLIED" })
    expect(actor.getSnapshot().context.pendingNavigation).toBeNull()

    actor.send({ type: "RESTORE_BROWSE_VIEW" })
    expect(actor.getSnapshot().context.pendingNavigation).toEqual({
      source: "spotify-metadata",
      rootKind: "albums",
      albumId: "in-utero",
      albumTitle: "In Utero",
    })
    expect(actor.getSnapshot().context.ignoreBrowseLocation).toBe(true)
    actor.stop()
  })

  it("rejects malformed payloads", () => {
    expect(parseAddToQueueUiState(null)).toBeNull()
    expect(parseAddToQueueUiState({ mode: "search" })).toBeNull()
    expect(
      parseAddToQueueUiState({
        mode: "browse",
        sourceFilter: "local",
        browse: { source: "local", rootKind: "nope", level: "root" },
      }),
    ).toEqual({ mode: "browse", sourceFilter: "local" })
    expect(sessionStorage.getItem(`${ADD_TO_QUEUE_UI_STORAGE_PREFIX}${ROOM}`)).toBeNull()
  })
})

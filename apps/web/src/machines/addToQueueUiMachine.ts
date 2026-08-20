/**
 * Add to Queue modal UI (ADR 0105).
 * Room-scoped Search/Browse chrome + browse location, persisted to sessionStorage.
 */

import { assign, setup } from "xstate"

export const ADD_TO_QUEUE_UI_STORAGE_PREFIX = "addToQueueUi:"

export type AddToQueueMode = "search" | "browse"

export type AddToQueueBrowseRootKind = "artists" | "albums" | "media"

export type AddToQueueBrowseLevel = "root" | "artistAlbums" | "tracks"

export type AddToQueueBrowseLocation = {
  source: string
  rootKind: AddToQueueBrowseRootKind
  level: AddToQueueBrowseLevel
  artistId?: string
  artistTitle?: string
  albumId?: string
  albumTitle?: string
  mediaKey?: string
}

/** Deep-link / restore payload for CatalogBrowse. */
export type AddToQueueNavigation = {
  source: string
  rootKind?: AddToQueueBrowseRootKind
  artistId?: string
  artistTitle?: string
  albumId?: string
  albumTitle?: string
  mediaKey?: string
}

export type AddToQueueUiPersisted = {
  mode: AddToQueueMode
  sourceFilter: string
  browse?: AddToQueueBrowseLocation
}

export interface AddToQueueUiMachineContext {
  roomId: string | null
  mode: AddToQueueMode
  sourceFilter: string
  browse?: AddToQueueBrowseLocation
  pendingNavigation: AddToQueueNavigation | null
  /** Ignore CatalogBrowse default location until restore/deep-link applies. */
  ignoreBrowseLocation: boolean
  /** Session restore applied once per activation (after capabilities known). */
  restoreAttempted: boolean
  canBrowse: boolean
  browseableSourceIds: string[]
  metadataSourceIds: string[]
}

export type AddToQueueUiEvent =
  | { type: "ACTIVATE"; roomId: string }
  | { type: "DEACTIVATE" }
  | {
      type: "SET_CAPABILITIES"
      canBrowse: boolean
      browseableSourceIds: string[]
      metadataSourceIds: string[]
    }
  | { type: "DEEP_LINK_MEDIA"; mediaKey: string }
  | { type: "SET_MODE"; mode: AddToQueueMode }
  | { type: "SET_SOURCE"; sourceFilter: string }
  | { type: "OPEN_BROWSE"; nav: AddToQueueNavigation }
  | { type: "NAVIGATION_APPLIED" }
  | { type: "BROWSE_LOCATION"; location: AddToQueueBrowseLocation }
  /** Re-queue pending nav from `browse` (modal reopen / CatalogBrowse remount). */
  | { type: "RESTORE_BROWSE_VIEW" }

function isRootKind(value: unknown): value is AddToQueueBrowseRootKind {
  return value === "artists" || value === "albums" || value === "media"
}

function isLevel(value: unknown): value is AddToQueueBrowseLevel {
  return value === "root" || value === "artistAlbums" || value === "tracks"
}

function parseBrowse(raw: unknown): AddToQueueBrowseLocation | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  if (typeof obj.source !== "string" || !obj.source) return undefined
  if (!isRootKind(obj.rootKind) || !isLevel(obj.level)) return undefined

  const browse: AddToQueueBrowseLocation = {
    source: obj.source,
    rootKind: obj.rootKind,
    level: obj.level,
  }
  if (typeof obj.artistId === "string" && obj.artistId) browse.artistId = obj.artistId
  if (typeof obj.artistTitle === "string" && obj.artistTitle) browse.artistTitle = obj.artistTitle
  if (typeof obj.albumId === "string" && obj.albumId) browse.albumId = obj.albumId
  if (typeof obj.albumTitle === "string" && obj.albumTitle) browse.albumTitle = obj.albumTitle
  if (typeof obj.mediaKey === "string" && obj.mediaKey) browse.mediaKey = obj.mediaKey
  return browse
}

export function parseAddToQueueUiState(raw: unknown): AddToQueueUiPersisted | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  if (obj.mode !== "search" && obj.mode !== "browse") return null
  if (typeof obj.sourceFilter !== "string" || !obj.sourceFilter) return null
  const browse = parseBrowse(obj.browse)
  return browse
    ? { mode: obj.mode, sourceFilter: obj.sourceFilter, browse }
    : { mode: obj.mode, sourceFilter: obj.sourceFilter }
}

export function loadAddToQueueUi(roomId: string | null): AddToQueueUiPersisted | null {
  if (roomId == null || typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(ADD_TO_QUEUE_UI_STORAGE_PREFIX + roomId)
    if (!raw) return null
    return parseAddToQueueUiState(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export function saveAddToQueueUi(roomId: string | null, state: AddToQueueUiPersisted): void {
  if (roomId == null || typeof sessionStorage === "undefined") return
  const payload: AddToQueueUiPersisted = {
    mode: state.mode,
    sourceFilter: state.sourceFilter,
  }
  if (state.browse) payload.browse = state.browse
  sessionStorage.setItem(ADD_TO_QUEUE_UI_STORAGE_PREFIX + roomId, JSON.stringify(payload))
}

export function browseLocationToNavigation(
  browse: AddToQueueBrowseLocation,
): AddToQueueNavigation {
  const nav: AddToQueueNavigation = {
    source: browse.source,
    rootKind: browse.rootKind,
  }
  if (browse.level === "tracks" && browse.mediaKey) {
    nav.mediaKey = browse.mediaKey
    return nav
  }
  if (browse.level === "tracks" && browse.albumId) {
    nav.albumId = browse.albumId
    nav.albumTitle = browse.albumTitle
    if (browse.artistId) {
      nav.artistId = browse.artistId
      nav.artistTitle = browse.artistTitle
    }
    return nav
  }
  if (browse.level === "artistAlbums" && browse.artistId) {
    nav.artistId = browse.artistId
    nav.artistTitle = browse.artistTitle
    return nav
  }
  return nav
}

function clampSourceFilter(
  mode: AddToQueueMode,
  sourceFilter: string,
  browseableSourceIds: string[],
  metadataSourceIds: string[],
): string {
  if (mode === "browse") {
    if (sourceFilter !== "all" && browseableSourceIds.includes(sourceFilter)) {
      return sourceFilter
    }
    return browseableSourceIds[0] ?? sourceFilter
  }
  if (sourceFilter === "all" || metadataSourceIds.includes(sourceFilter)) {
    return sourceFilter
  }
  return "all"
}

function persistedSlice(context: AddToQueueUiMachineContext): AddToQueueUiPersisted {
  return {
    mode: context.mode,
    sourceFilter: context.sourceFilter,
    ...(context.browse ? { browse: context.browse } : {}),
  }
}

const emptyContext = (): AddToQueueUiMachineContext => ({
  roomId: null,
  mode: "search",
  sourceFilter: "all",
  browse: undefined,
  pendingNavigation: null,
  ignoreBrowseLocation: false,
  restoreAttempted: false,
  canBrowse: false,
  browseableSourceIds: [],
  metadataSourceIds: [],
})

export const addToQueueUiMachine = setup({
  types: {
    context: {} as AddToQueueUiMachineContext,
    events: {} as AddToQueueUiEvent,
  },
  actions: {
    persistUi: ({ context }) => {
      saveAddToQueueUi(context.roomId, persistedSlice(context))
    },
    activateRoom: assign(({ event }) => {
      if (event.type !== "ACTIVATE") return {}
      const stored = loadAddToQueueUi(event.roomId)
      return {
        roomId: event.roomId,
        mode: stored?.mode ?? "search",
        sourceFilter: stored?.sourceFilter ?? "all",
        browse: stored?.browse,
        pendingNavigation: null,
        ignoreBrowseLocation: false,
        restoreAttempted: false,
        canBrowse: false,
        browseableSourceIds: [] as string[],
        metadataSourceIds: [] as string[],
      }
    }),
    deactivateRoom: assign(() => emptyContext()),
    setCapabilities: assign(({ context, event }) => {
      if (event.type !== "SET_CAPABILITIES") return {}
      const { canBrowse, browseableSourceIds, metadataSourceIds } = event
      let mode = context.mode
      if (!canBrowse && mode === "browse") mode = "search"

      const sourceFilter = clampSourceFilter(
        mode,
        context.sourceFilter,
        browseableSourceIds,
        metadataSourceIds,
      )

      const becameBrowsable = canBrowse && !context.canBrowse
      const shouldRestore =
        canBrowse &&
        Boolean(context.browse) &&
        !context.pendingNavigation &&
        (!context.restoreAttempted || becameBrowsable)

      return {
        canBrowse,
        browseableSourceIds,
        metadataSourceIds,
        mode,
        sourceFilter,
        restoreAttempted: context.restoreAttempted || canBrowse || browseableSourceIds.length === 0,
        ...(shouldRestore && context.browse
          ? {
              pendingNavigation: browseLocationToNavigation(context.browse),
              ignoreBrowseLocation: true,
            }
          : {}),
      }
    }),
    deepLinkMedia: assign(({ context, event }) => {
      if (event.type !== "DEEP_LINK_MEDIA") return {}
      if (!context.browseableSourceIds.includes("local")) return {}
      return {
        mode: "browse" as const,
        sourceFilter: "local",
        pendingNavigation: {
          source: "local",
          mediaKey: event.mediaKey,
          rootKind: "media" as const,
        },
        ignoreBrowseLocation: true,
        restoreAttempted: true,
      }
    }),
    setMode: assign(({ context, event }) => {
      if (event.type !== "SET_MODE") return {}
      let mode = event.mode
      if (mode === "browse" && !context.canBrowse) mode = "search"
      const sourceFilter = clampSourceFilter(
        mode,
        context.sourceFilter,
        context.browseableSourceIds,
        context.metadataSourceIds,
      )
      return { mode, sourceFilter }
    }),
    setSource: assign(({ context, event }) => {
      if (event.type !== "SET_SOURCE") return {}
      return {
        sourceFilter: clampSourceFilter(
          context.mode,
          event.sourceFilter,
          context.browseableSourceIds,
          context.metadataSourceIds,
        ),
      }
    }),
    openBrowse: assign(({ event }) => {
      if (event.type !== "OPEN_BROWSE") return {}
      return {
        mode: "browse" as const,
        sourceFilter: event.nav.source,
        pendingNavigation: event.nav,
        ignoreBrowseLocation: true,
      }
    }),
    clearPendingNavigation: assign({
      pendingNavigation: null,
      ignoreBrowseLocation: false,
    }),
    setBrowseLocation: assign(({ context, event }) => {
      if (event.type !== "BROWSE_LOCATION") return {}
      if (context.ignoreBrowseLocation) return {}
      return { browse: event.location }
    }),
    restoreBrowseView: assign(({ context }) => {
      if (context.mode !== "browse" || !context.canBrowse || !context.browse) return {}
      // Already queued (e.g. SET_CAPABILITIES + modal open in the same tick).
      if (context.pendingNavigation) return { ignoreBrowseLocation: true }
      return {
        pendingNavigation: browseLocationToNavigation(context.browse),
        ignoreBrowseLocation: true,
      }
    }),
  },
}).createMachine({
  id: "addToQueueUi",
  context: emptyContext(),
  initial: "inactive",
  states: {
    inactive: {
      on: {
        ACTIVATE: {
          target: "active",
          actions: "activateRoom",
        },
      },
    },
    active: {
      on: {
        ACTIVATE: {
          actions: "activateRoom",
        },
        DEACTIVATE: {
          target: "inactive",
          actions: "deactivateRoom",
        },
        SET_CAPABILITIES: {
          actions: ["setCapabilities", "persistUi"],
        },
        DEEP_LINK_MEDIA: {
          actions: ["deepLinkMedia", "persistUi"],
        },
        SET_MODE: {
          actions: ["setMode", "persistUi"],
        },
        SET_SOURCE: {
          actions: ["setSource", "persistUi"],
        },
        OPEN_BROWSE: {
          actions: ["openBrowse", "persistUi"],
        },
        NAVIGATION_APPLIED: {
          actions: "clearPendingNavigation",
        },
        BROWSE_LOCATION: {
          actions: ["setBrowseLocation", "persistUi"],
        },
        RESTORE_BROWSE_VIEW: {
          actions: "restoreBrowseView",
        },
      },
    },
  },
})

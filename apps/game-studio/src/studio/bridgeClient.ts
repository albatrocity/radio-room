import type {
  BingoCard,
  ChatMessage,
  GameSession,
  GiftOffer,
  InventoryItem,
  ItemDefinition,
  PhysicalMediaPick,
  PickableRecordSource,
  Poll,
  PollHistoryEntry,
  QueueItem,
  ShoppingSessionInstance,
  StoredArtifactPublic,
  TradeInvite,
  TradeSession,
  User,
  UserGameState,
} from "@repo/types"
import { io as ioClient, type Socket as IoClientSocket } from "socket.io-client"
import { readBingoCard } from "./studioBingoRead"
import { readShoppingInstance } from "./studioShoppingRead"
import type { StudioRoom } from "./studioRoom"
import {
  dispatchStudioBridgeCommand,
  type StudioBridgeCommand,
  type StudioBridgeCommandResult,
} from "./studioBridgeCommands"

/**
 * Must stay aligned with `apps/studio-bridge/src/types.ts` `BridgeSnapshot`.
 * Serialized JSON POSTed to `POST /sync`.
 */
export type StudioBridgeSnapshot = {
  roomId: string
  users: User[]
  chat: ChatMessage[]
  queue: QueueItem[]
  activeSession: GameSession | null
  userStates: Record<string, UserGameState>
  inventories: Record<string, InventoryItem[]>
  itemDefinitions: ItemDefinition[]
  pluginConfigs: Record<string, Record<string, unknown>>
  shoppingByUser: Record<string, ShoppingSessionInstance | null>
  bingoByUser?: Record<string, BingoCard | null>
  storedArtifacts: StoredArtifactPublic[]
  activePoll?: Poll | null
  pollHistory?: PollHistoryEntry[]
  /** App-controlled queue split anchor (canonical key of first track below divider). */
  splitKey?: string | null
  pendingGifts?: GiftOffer[]
  pendingTradeInvites?: TradeInvite[]
  trades?: Record<string, TradeSession>
}

export function serializeStudioRoom(room: StudioRoom): StudioBridgeSnapshot {
  const users = [...room.users.values()]
  const userStates: Record<string, UserGameState> = {}
  for (const [uid, st] of room.userStates) {
    userStates[uid] = st
  }
  const inventories: Record<string, InventoryItem[]> = {}
  for (const [uid, inv] of room.inventories) {
    inventories[uid] = inv
  }
  const pluginConfigs: Record<string, Record<string, unknown>> = {}
  for (const [name, cfg] of room.pluginConfigs) {
    pluginConfigs[name] = cfg
  }
  const shoppingByUser: Record<string, ShoppingSessionInstance | null> = {}
  const bingoByUser: Record<string, BingoCard | null> = {}
  for (const u of users) {
    shoppingByUser[u.userId] = readShoppingInstance(room, u.userId)
    bingoByUser[u.userId] = readBingoCard(room, u.userId)
  }

  const storedArtifacts: StoredArtifactPublic[] = room.storedArtifacts.map(
    ({ password: _password, ...pub }) => pub,
  )

  const trades: Record<string, TradeSession> = {}
  for (const [id, trade] of room.trades) {
    trades[id] = trade
  }

  return {
    roomId: room.roomId,
    users,
    chat: room.chat,
    queue: room.queue,
    activeSession: room.activeSession,
    userStates,
    inventories,
    itemDefinitions: [...room.definitions.values()],
    pluginConfigs,
    shoppingByUser,
    bingoByUser,
    storedArtifacts,
    activePoll: room.activePoll,
    pollHistory: room.pollHistory,
    pendingGifts: [...room.pendingGifts],
    pendingTradeInvites: [...room.pendingTradeInvites],
    trades,
  }
}

const DEBOUNCE_MS = 150

let studioBridgeSyncWarned = false

/**
 * Push sandbox state to the local studio-bridge server whenever `StudioRoom` mutates.
 * Set `VITE_STUDIO_BRIDGE_URL` (e.g. http://127.0.0.1:3099) — `make game-studio` starts the bridge.
 */
export function connectStudioBridge(
  room: StudioRoom,
  baseUrl: string,
): { stop: () => void; resync: () => void } {
  const root = baseUrl.replace(/\/$/, "")
  let timer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false

  const flush = async (): Promise<void> => {
    if (cancelled) return
    const body = serializeStudioRoom(room)
    try {
      await fetch(`${root}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } catch (e) {
      if (!studioBridgeSyncWarned) {
        studioBridgeSyncWarned = true
        console.warn("[game-studio] studio-bridge sync failed (is `make game-studio` running?)", e)
      }
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, DEBOUNCE_MS)
  }

  const unsub = room.subscribe(schedule)
  void flush()

  return {
    stop: () => {
      cancelled = true
      unsub()
      if (timer) clearTimeout(timer)
    },
    // A restarted bridge has no snapshot until the next mutation; push one now.
    resync: schedule,
  }
}

/**
 * Tell studio-bridge to switch every Listening Room preview tab in `roomId` to view as `userId`.
 * Requires `make game-studio` / studio-bridge on `VITE_STUDIO_BRIDGE_URL`.
 */
export async function requestStudioBridgeViewAs(
  baseUrl: string,
  roomId: string,
  userId: string,
): Promise<void> {
  const root = baseUrl.replace(/\/$/, "")
  const res = await fetch(`${root}/preview/view-as`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, userId }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`view-as failed (${res.status}): ${detail || res.statusText}`)
  }
}

/**
 * Receive Room UI actions (chat, inventory, plugin buttons) from Listening Room via studio-bridge.
 */
export function connectStudioBridgeControl(
  baseUrl: string,
  roomId: string,
  options: { onConnect?: () => void } = {},
): () => void {
  const root = baseUrl.replace(/\/$/, "")
  const socket: IoClientSocket = ioClient(root, {
    transports: ["websocket", "polling"],
    autoConnect: true,
  })

  const onConnect = (): void => {
    socket.emit("STUDIO_SUBSCRIBE", { roomId })
    options.onConnect?.()
  }

  const onEvent = (
    msg: { type?: string; data?: unknown },
    ack?: (result: StudioBridgeCommandResult) => void,
  ): void => {
    if (msg?.type !== "STUDIO_BRIDGE_COMMAND" || !msg.data || typeof msg.data !== "object") {
      ack?.({ success: false, message: "Bad bridge command" })
      return
    }
    void dispatchStudioBridgeCommand(msg.data as StudioBridgeCommand)
      .then((result) => {
        ack?.(result)
      })
      .catch((e) => {
        console.warn("[game-studio] studio bridge command failed", e)
        ack?.({ success: false, message: String(e) })
      })
  }

  socket.on("connect", onConnect)
  socket.on("event", onEvent)

  if (socket.connected) {
    onConnect()
  }

  return () => {
    socket.off("connect", onConnect)
    socket.off("event", onEvent)
    socket.disconnect()
  }
}

/** One album the record picker lists (ADR 0216); `coverUrl` is for the picker only. */
export type StudioRecordHit = Omit<PhysicalMediaPick, "format" | "lore"> & { coverUrl?: string }

export type StudioRecordSearch = {
  results: StudioRecordHit[]
  unavailable: { source: PickableRecordSource; reason: string }[]
}

function absoluteCover(root: string, coverUrl: string | undefined): string | undefined {
  if (!coverUrl) return undefined
  return coverUrl.startsWith("/") ? `${root}${coverUrl}` : coverUrl
}

/** Search Spotify and the designer's Navidrome through studio-bridge. */
export async function searchStudioRecords(
  baseUrl: string,
  query: string,
): Promise<StudioRecordSearch> {
  const root = baseUrl.replace(/\/$/, "")
  const res = await fetch(`${root}/records/search?q=${encodeURIComponent(query)}`).catch(() => {
    throw new Error("studio-bridge isn't reachable. Run `make game-studio`.")
  })
  if (!res.ok) throw new Error(`Record search failed (${res.status})`)
  const body = (await res.json()) as StudioRecordSearch
  return {
    ...body,
    results: body.results.map((hit) => ({ ...hit, coverUrl: absoluteCover(root, hit.coverUrl) })),
  }
}

/** A ready pick (snapshot, lore, format) for one album; `id` may be a Spotify URL. */
export async function fetchStudioRecordPick(
  baseUrl: string,
  source: PickableRecordSource,
  id: string,
): Promise<PhysicalMediaPick> {
  const root = baseUrl.replace(/\/$/, "")
  const res = await fetch(`${root}/records/${source}/${encodeURIComponent(id)}`)
  const body = (await res.json().catch(() => ({}))) as { pick?: PhysicalMediaPick; error?: string }
  if (!res.ok || !body.pick) throw new Error(body.error ?? `Album lookup failed (${res.status})`)
  return body.pick
}

/** A local pick's cover through studio-bridge; Spotify picks carry their own. */
export function studioRecordCover(baseUrl: string, pick: PhysicalMediaPick): string | undefined {
  if (pick.imageUrl) return pick.imageUrl
  if (pick.source !== "local") return undefined
  return `${baseUrl.replace(/\/$/, "")}/records/local/${encodeURIComponent(pick.id)}/cover`
}

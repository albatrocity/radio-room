import http from "node:http"
import cors from "cors"
import express from "express"
import type { Socket } from "socket.io"
import type { Server as IOServer } from "socket.io"
import { Server } from "socket.io"
import type { User } from "@repo/types/User"

import type { BridgeSnapshot } from "./types.js"
import {
  buildInitPayload,
  buildRoomGameStateSnapshot,
  buildRoomMeta,
  buildUserGameStatePayload,
  resolveBridgeUser,
  roomSocketPath,
  studioControlRoomPath,
} from "./payloads.js"
import {
  consumeSnapshotBroadcast,
  diffUsers,
  getBridgeSnapshot,
  getLastSyncEpochMs,
  getPreviousBridgeSnapshot,
  queueHeadTrackId,
  setBridgeSnapshot,
} from "./snapshotStore.js"
import {
  BRIDGE_PRE_SYNC_ISO,
  stubRoomForRoomData,
  stubStudioBridgeRoom,
} from "./stubRoom.js"
import { bridgePluginSchemasForApi } from "./stubPluginSchemas.js"

const PORT = Number(process.env.STUDIO_BRIDGE_PORT ?? process.env.PORT ?? 3099)

/** Stable ISO time for stub room docs (avoids a new Room identity every emit). */
function bridgeRoomTimestampIso(): string {
  const ms = getLastSyncEpochMs()
  return ms > 0 ? new Date(ms).toISOString() : BRIDGE_PRE_SYNC_ISO
}

/** Updates socket identity and pushes INIT + USER_GAME_STATE (same contract as socket VIEW_AS_USER). */
function applyViewAsToSocket(socket: Socket, snap: BridgeSnapshot, newUser: User): void {
  socket.data.userId = newUser.userId
  socket.data.username = newUser.username
  socket.emit("event", {
    type: "INIT",
    data: buildInitPayload(snap, newUser),
  })
  socket.emit("event", {
    type: "USER_GAME_STATE",
    data: buildUserGameStatePayload(snap, newUser.userId),
  })
}

/** Forward Room UI actions to the first connected Game Studio tab (same machine). */
async function forwardRoomUiCommandToStudio(
  io: IOServer,
  roomId: string,
  command: Record<string, unknown>,
): Promise<boolean> {
  const path = studioControlRoomPath(roomId)
  const sockets = await io.in(path).fetchSockets()
  if (sockets.length === 0) return false
  sockets[0]!.emit("event", {
    type: "STUDIO_BRIDGE_COMMAND",
    data: command,
  })
  return true
}

function broadcastRefresh(io: IOServer, roomId: string): void {
  const snap = getBridgeSnapshot()
  if (!snap || snap.roomId !== roomId) return
  // Identical snapshot spam (debounced sync + modifier tick) caused React "Maximum update depth".
  if (!consumeSnapshotBroadcast(snap)) return

  const prevSnap = getPreviousBridgeSnapshot()
  const refreshedAt = bridgeRoomTimestampIso()

  const roomPath = roomSocketPath(roomId)

  if (prevSnap && prevSnap.roomId === snap.roomId) {
    const { joined, left } = diffUsers(prevSnap, snap)
    for (const user of joined) {
      io.to(roomPath).emit("event", {
        type: "USER_JOINED",
        data: { roomId, user, users: snap.users },
      })
    }
    for (const user of left) {
      io.to(roomPath).emit("event", {
        type: "USER_LEFT",
        data: { roomId, user, users: snap.users },
      })
    }
  }

  const sameRoom = prevSnap && prevSnap.roomId === snap.roomId
  const prevTrackId = sameRoom ? queueHeadTrackId(prevSnap) : null
  const nextTrackId = queueHeadTrackId(snap)
  if (prevTrackId !== nextTrackId) {
    const track = snap.queue[0]
    io.to(roomPath).emit("event", {
      type: "TRACK_CHANGED",
      data: {
        roomId,
        ...(track ? { track } : {}),
        meta: buildRoomMeta(snap),
      },
    })
  }

  void io.in(roomPath).fetchSockets().then((sockets) => {
    for (const s of sockets) {
      const uid = s.data.userId as string | undefined
      if (!uid) continue
      s.emit("event", {
        type: "USER_GAME_STATE",
        data: buildUserGameStatePayload(snap, uid),
      })
      s.emit("event", {
        type: "ROOM_GAME_STATE",
        data: buildRoomGameStateSnapshot(snap),
      })
    }

    io.to(roomSocketPath(roomId)).emit("event", {
      type: "ROOM_DATA",
      data: {
        room: stubRoomForRoomData(roomId, snap, refreshedAt),
        messages: snap.chat,
        playlist: [],
        scheduleSnapshot: null,
      },
    })
  })
}

function wireSocketHandlers(io: IOServer): void {
  io.on("connection", (socket) => {
    socket.on("STUDIO_SUBSCRIBE", (payload: { roomId?: string }) => {
      if (typeof payload?.roomId !== "string") return
      socket.join(studioControlRoomPath(payload.roomId))
    })

    socket.on(
      "LOGIN",
      (payload: {
        userId?: string
        username?: string
        password?: string
        roomId: string
        fetchAllData?: boolean
      }) => {
        const snap = getBridgeSnapshot()
        if (!snap || snap.roomId !== payload.roomId) {
          socket.emit("event", {
            type: "ERROR_OCCURRED",
            data: {
              status: 503,
              error: "Studio bridge",
              message:
                "No sandbox snapshot for this room yet. Keep Game Studio open on this machine (same room id), then refresh.",
            },
          })
          return
        }

        const user = resolveBridgeUser(snap, payload.userId, payload.username)
        socket.data.userId = user.userId
        socket.data.username = user.username
        socket.data.roomId = payload.roomId

        socket.join(roomSocketPath(payload.roomId))

        socket.emit("event", {
          type: "INIT",
          data: buildInitPayload(snap, user),
        })
      },
    )

    socket.on("VIEW_AS_USER", (payload: { userId?: string; username?: string }) => {
      const roomId = socket.data.roomId as string | undefined
      const snap = getBridgeSnapshot()
      if (!roomId || !snap || snap.roomId !== roomId) return
      const newUser = resolveBridgeUser(snap, payload.userId, payload.username)
      applyViewAsToSocket(socket, snap, newUser)
    })

    socket.on("GET_MY_GAME_STATE", () => {
      const roomId = socket.data.roomId as string | undefined
      const uid = socket.data.userId as string | undefined
      const snap = getBridgeSnapshot()
      if (!roomId || !uid || !snap || snap.roomId !== roomId) {
        socket.emit("event", {
          type: "USER_GAME_STATE",
          data: {
            session: null,
            state: null,
            inventory: null,
            itemDefinitions: [],
            currentShopInstance: null,
          },
        })
        return
      }
      socket.emit("event", {
        type: "USER_GAME_STATE",
        data: buildUserGameStatePayload(snap, uid),
      })
    })

    socket.on("GET_ROOM_GAME_STATE", () => {
      const roomId = socket.data.roomId as string | undefined
      const snap = getBridgeSnapshot()
      if (!roomId || !snap || snap.roomId !== roomId) {
        socket.emit("event", {
          type: "ROOM_GAME_STATE",
          data: { sessionId: null, modifiersByUserId: {} },
        })
        return
      }
      socket.emit("event", {
        type: "ROOM_GAME_STATE",
        data: buildRoomGameStateSnapshot(snap),
      })
    })

    socket.on("GET_ROOM_SETTINGS", (_url?: string) => {
      const roomId = socket.data.roomId as string | undefined
      const snap = getBridgeSnapshot()
      if (!roomId) return
      socket.emit("event", {
        type: "ROOM_SETTINGS",
        data: {
          room: stubStudioBridgeRoom(roomId, snap ?? null, bridgeRoomTimestampIso()),
          pluginConfigs: snap?.pluginConfigs ?? {},
        },
      })
    })

    socket.on(
      "GET_LATEST_ROOM_DATA",
      (_snapshot: { id: string; lastMessageTime?: number; lastPlaylistItemTime?: number }) => {
        const roomId = socket.data.roomId as string | undefined
        const snap = getBridgeSnapshot()
        if (!roomId || !snap || snap.roomId !== roomId) return
        socket.emit("event", {
          type: "ROOM_DATA",
          data: {
            room: stubRoomForRoomData(roomId, snap, bridgeRoomTimestampIso()),
            messages: snap.chat,
            playlist: [],
            scheduleSnapshot: null,
          },
        })
      },
    )

    socket.on(
      "USE_INVENTORY_ITEM",
      async (data: {
        itemId?: string
        targetUserId?: string
        targetQueueItemId?: string
        targetInventoryItemId?: string
        password?: string
        coinAmount?: number
      }) => {
        const roomId = socket.data.roomId as string | undefined
        const userId = socket.data.userId as string | undefined
        if (!roomId || !userId || !data?.itemId) {
          socket.emit("event", {
            type: "INVENTORY_ACTION_RESULT",
            data: { success: false, message: "Not in a room or missing itemId." },
          })
          return
        }
        const forwarded = await forwardRoomUiCommandToStudio(io, roomId, {
          kind: "USE_INVENTORY_ITEM",
          roomId,
          userId,
          itemId: data.itemId,
          ...(data.targetUserId != null ? { targetUserId: data.targetUserId } : {}),
          ...(data.targetQueueItemId != null ? { targetQueueItemId: data.targetQueueItemId } : {}),
          ...(data.targetInventoryItemId != null
            ? { targetInventoryItemId: data.targetInventoryItemId }
            : {}),
          ...(data.password != null ? { password: data.password } : {}),
          ...(data.coinAmount != null ? { coinAmount: data.coinAmount } : {}),
        })
        socket.emit("event", {
          type: "INVENTORY_ACTION_RESULT",
          data: forwarded
            ? { success: true, message: "Applied in Game Studio sandbox." }
            : {
                success: false,
                message:
                  "Game Studio is not connected to the bridge. Run `make game-studio` and keep that tab open.",
              },
        })
      },
    )

    socket.on("SELL_INVENTORY_ITEM", async (data: { itemId?: string }) => {
      const roomId = socket.data.roomId as string | undefined
      const userId = socket.data.userId as string | undefined
      if (!roomId || !userId || !data?.itemId) {
        socket.emit("event", {
          type: "INVENTORY_ACTION_RESULT",
          data: { success: false, message: "Not in a room or missing itemId." },
        })
        return
      }
      const forwarded = await forwardRoomUiCommandToStudio(io, roomId, {
        kind: "SELL_INVENTORY_ITEM",
        roomId,
        userId,
        itemId: data.itemId,
      })
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: forwarded
          ? { success: true, message: "Applied in Game Studio sandbox." }
          : {
              success: false,
              message:
                "Game Studio is not connected to the bridge. Run `make game-studio` and keep that tab open.",
            },
      })
    })

    socket.on("SEND_MESSAGE", async (message: string | { content?: string }) => {
      const roomId = socket.data.roomId as string | undefined
      const userId = socket.data.userId as string | undefined
      if (!roomId || !userId) return
      const raw =
        typeof message === "string"
          ? message
          : message && typeof message === "object" && message.content != null
            ? String(message.content)
            : ""
      const trimmed = raw.trim()
      if (!trimmed) return
      await forwardRoomUiCommandToStudio(io, roomId, {
        kind: "SEND_MESSAGE",
        roomId,
        userId,
        content: trimmed,
      })
    })

    socket.on(
      "EXECUTE_PLUGIN_ACTION",
      async (data: { pluginName?: string; action?: string }) => {
        const roomId = socket.data.roomId as string | undefined
        const userId = socket.data.userId as string | undefined
        if (!roomId || !userId || !data?.pluginName || !data?.action) {
          socket.emit("event", {
            type: "PLUGIN_ACTION_RESULT",
            data: { success: false, message: "Not in a room or missing plugin action." },
          })
          return
        }
        const forwarded = await forwardRoomUiCommandToStudio(io, roomId, {
          kind: "EXECUTE_PLUGIN_ACTION",
          roomId,
          userId,
          pluginName: data.pluginName,
          action: data.action,
        })
        socket.emit("event", {
          type: "PLUGIN_ACTION_RESULT",
          data: forwarded
            ? { success: true, message: "Applied in Game Studio sandbox." }
            : {
                success: false,
                message:
                  "Game Studio is not connected to the bridge. Run `make game-studio` and keep that tab open.",
              },
        })
      },
    )

    socket.on("GET_STORED_ARTIFACTS", () => {
      socket.emit("event", {
        type: "STORED_ARTIFACTS_RESULT",
        data: { artifacts: [] },
      })
    })
  })
}

function validateSnapshot(body: unknown): BridgeSnapshot | null {
  if (!body || typeof body !== "object") return null
  const o = body as Record<string, unknown>
  if (typeof o.roomId !== "string") return null
  if (!Array.isArray(o.users)) return null
  if (!Array.isArray(o.chat)) return null
  if (!Array.isArray(o.queue)) return null
  if (o.activeSession !== null && typeof o.activeSession !== "object") return null
  if (!o.userStates || typeof o.userStates !== "object") return null
  if (!o.inventories || typeof o.inventories !== "object") return null
  if (!Array.isArray(o.itemDefinitions)) return null
  if (!o.pluginConfigs || typeof o.pluginConfigs !== "object") return null
  if (!o.shoppingByUser || typeof o.shoppingByUser !== "object") return null
  return body as BridgeSnapshot
}

let io: IOServer | null = null

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: "8mb" }))

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "studio-bridge" })
})

app.get("/me", (_req, res) => {
  res.status(200).json({
    user: {
      userId: "studio-bridge-http-guest",
      username: "Guest",
      status: "listening",
    },
    isNewUser: false,
  })
})

app.post("/logout", (_req, res) => {
  res.status(200).send("Logged out")
})

app.get("/api/plugins", (_req, res) => {
  res.status(200).json({ plugins: bridgePluginSchemasForApi })
})

/** Must be registered before `/rooms/:roomId` — otherwise `/rooms/all` is captured as roomId `"all"`. */
app.get("/rooms/all", (_req, res) => {
  const snap = getBridgeSnapshot()
  const refreshedAt = bridgeRoomTimestampIso()
  if (!snap) {
    res.status(200).json({ rooms: [] })
    return
  }
  const room = stubStudioBridgeRoom(snap.roomId, snap, refreshedAt)
  res.status(200).json({
    rooms: [
      {
        ...room,
        creatorName: room.creator,
        userCount: snap.users.length,
        nowPlaying: snap.queue[0] ?? null,
      },
    ],
  })
})

app.get("/rooms/:roomId", (req, res) => {
  const roomId = req.params.roomId
  const snap = getBridgeSnapshot()
  const doc = stubStudioBridgeRoom(
    roomId,
    snap && snap.roomId === roomId ? snap : null,
    bridgeRoomTimestampIso(),
  )
  res.status(200).json({
    room: doc,
    scheduleSnapshot: null,
  })
})

app.post("/sync", (req, res) => {
  const parsed = validateSnapshot(req.body)
  if (!parsed) {
    res.status(400).json({ error: "Invalid BridgeSnapshot body" })
    return
  }
  setBridgeSnapshot(parsed)
  res.status(204).end()
  if (io) {
    broadcastRefresh(io, parsed.roomId)
  }
})

app.post("/broadcast", (req, res) => {
  const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : null
  if (!roomId || !io) {
    res.status(400).json({ error: "Missing roomId or server not ready" })
    return
  }
  broadcastRefresh(io, roomId)
  res.status(204).end()
})

app.post("/emit", (req, res) => {
  const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : null
  const type = typeof req.body?.type === "string" ? req.body.type : null
  if (!roomId || !type || !io) {
    res.status(400).json({ error: "Expected { roomId, type, data? }" })
    return
  }
  const data = req.body?.data
  io.to(roomSocketPath(roomId)).emit("event", { type, data })
  res.status(204).end()
})

/**
 * Apply “view as” to every socket in the room (Listening Room preview tabs).
 * Called from Game Studio so sandbox authors can switch preview identity without the browser console.
 */
app.post("/preview/view-as", async (req, res) => {
  const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : null
  const userId = typeof req.body?.userId === "string" ? req.body.userId : undefined
  const username = typeof req.body?.username === "string" ? req.body.username : undefined
  if (!roomId || !io) {
    res.status(400).json({ error: "Expected { roomId, userId? | username? }" })
    return
  }
  if (!userId && !username) {
    res.status(400).json({ error: "Provide userId or username" })
    return
  }
  const snap = getBridgeSnapshot()
  if (!snap || snap.roomId !== roomId) {
    res.status(404).json({ error: "No snapshot for this room" })
    return
  }
  const newUser = resolveBridgeUser(snap, userId, username)
  try {
    const sockets = await io.in(roomSocketPath(roomId)).fetchSockets()
    for (const s of sockets) {
      applyViewAsToSocket(s, snap, newUser)
    }
    res.status(204).end()
  } catch (e) {
    console.error("[studio-bridge] POST /preview/view-as", e)
    res.status(500).json({ error: String(e) })
  }
})

const httpServer = http.createServer(app)

io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"],
})

wireSocketHandlers(io)

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`[studio-bridge] listening on http://127.0.0.1:${PORT}`)
})

import http from "node:http"
import cors from "cors"
import express from "express"
import type { Server as IOServer } from "socket.io"
import { Server } from "socket.io"

import type { BridgeSnapshot } from "./types.js"
import {
  buildInitPayload,
  buildRoomGameStateSnapshot,
  buildUserGameStatePayload,
  resolveBridgeUser,
  roomSocketPath,
} from "./payloads.js"
import {
  consumeSnapshotBroadcast,
  getBridgeSnapshot,
  getLastSyncEpochMs,
  setBridgeSnapshot,
} from "./snapshotStore.js"
import {
  BRIDGE_PRE_SYNC_ISO,
  stubRoomForRoomData,
  stubStudioBridgeRoom,
} from "./stubRoom.js"

const PORT = Number(process.env.STUDIO_BRIDGE_PORT ?? process.env.PORT ?? 3099)

/** Stable ISO time for stub room docs (avoids a new Room identity every emit). */
function bridgeRoomTimestampIso(): string {
  const ms = getLastSyncEpochMs()
  return ms > 0 ? new Date(ms).toISOString() : BRIDGE_PRE_SYNC_ISO
}

function broadcastRefresh(io: IOServer, roomId: string): void {
  const snap = getBridgeSnapshot()
  if (!snap || snap.roomId !== roomId) return
  // Identical snapshot spam (debounced sync + modifier tick) caused React "Maximum update depth".
  if (!consumeSnapshotBroadcast(snap)) return

  const refreshedAt = bridgeRoomTimestampIso()

  void io.in(roomSocketPath(roomId)).fetchSockets().then((sockets) => {
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

    socket.on("USE_INVENTORY_ITEM", () => {
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: {
          success: false,
          message: "Use Game Studio to use items against the sandbox.",
        },
      })
    })

    socket.on("SELL_INVENTORY_ITEM", () => {
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: {
          success: false,
          message: "Use Game Studio for sell flows in the sandbox.",
        },
      })
    })

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
  res.status(200).json({ plugins: [] })
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

const httpServer = http.createServer(app)

io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"],
})

wireSocketHandlers(io)

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`[studio-bridge] listening on http://127.0.0.1:${PORT}`)
})

import http from "node:http"
import cors from "cors"
import express from "express"
import type { Socket } from "socket.io"
import type { Server as IOServer } from "socket.io"
import { Server } from "socket.io"
import type { User } from "@repo/types/User"

import type { BridgeSnapshot } from "./types.js"
import {
  buildAllListenerGameStatesPayload,
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
  queueChanged,
  queueHeadTrackId,
  setBridgeSnapshot,
} from "./snapshotStore.js"
import {
  BRIDGE_PRE_SYNC_ISO,
  stubRoomForRoomData,
  stubStudioBridgeRoom,
} from "./stubRoom.js"
import { bridgePluginSchemasForApi } from "./stubPluginSchemas.js"
import { buildStubActivePoll } from "./stubPoll.js"
import { applyUserUpdateToSnapshot, toggleVipOnUser, userHasVip } from "./personas.js"

const PORT = Number(process.env.STUDIO_BRIDGE_PORT ?? process.env.PORT ?? 3099)

/** When `pollPreview=1` on the Socket.IO handshake query, LOGIN includes a stub active poll. */
function pollPreviewEnabled(socket: Socket): boolean {
  const q = socket.handshake.query.pollPreview ?? socket.handshake.query.polls
  const raw = Array.isArray(q) ? q[0] : q
  return raw === "1" || raw === "true"
}

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

type StudioCommandAck = {
  success?: boolean
  message?: string
  pollId?: string
  optionId?: string
  isSwap?: boolean
  totalVotes?: number | null
  voteReason?: "POLL_CLOSED" | "POLL_NOT_FOUND" | "INVALID_OPTION" | "UNAUTHORIZED"
  poll?: BridgeSnapshot["activePoll"]
  closedPoll?: BridgeSnapshot["activePoll"]
  results?: { pollId: string; totalVotes: number; optionTallies: Record<string, number>; winners: string[]; closedAt: number }
  deletedPollId?: string
}

type StudioEmitWithAck = {
  emit: (ev: string, payload: unknown, ack?: (response: unknown) => void) => void
}

/** Forward Room UI actions to the first connected Game Studio tab (same machine). */
async function forwardRoomUiCommandToStudio(
  io: IOServer,
  roomId: string,
  command: Record<string, unknown>,
): Promise<boolean> {
  const ack = await forwardRoomUiCommandToStudioWithAck(io, roomId, command)
  return ack != null
}

async function forwardRoomUiCommandToStudioWithAck(
  io: IOServer,
  roomId: string,
  command: Record<string, unknown>,
): Promise<StudioCommandAck | null> {
  const path = studioControlRoomPath(roomId)
  const sockets = await io.in(path).fetchSockets()
  if (sockets.length === 0) return null

  return new Promise((resolve) => {
    const toGameStudio = sockets[0]! as unknown as StudioEmitWithAck
    toGameStudio.emit(
      "event",
      { type: "STUDIO_BRIDGE_COMMAND", data: command },
      (response: unknown) => {
        resolve((response ?? null) as StudioCommandAck | null)
      },
    )
  })
}

function studioNotConnectedMessage(): string {
  return "Game Studio is not connected to the bridge. Run `make game-studio` and keep that tab open."
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

  if (sameRoom && prevSnap && queueChanged(prevSnap, snap)) {
    io.to(roomPath).emit("event", {
      type: "QUEUE_CHANGED",
      data: { roomId, queue: snap.queue },
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

        const initData = buildInitPayload(snap, user)
        if (pollPreviewEnabled(socket) && !initData.activePoll) {
          initData.activePoll = buildStubActivePoll(payload.roomId)
        }

        socket.emit("event", {
          type: "INIT",
          data: initData,
        })

        if (initData.activePoll && pollPreviewEnabled(socket)) {
          socket.emit("event", {
            type: "POLL_PUBLISHED",
            data: { roomId: payload.roomId, poll: initData.activePoll },
          })
        }
      },
    )

    socket.on(
      "TOGGLE_PERSONA",
      (data: { userId: string; personaId: string } | undefined) => {
        const roomId = socket.data.roomId as string | undefined
        const callerId = socket.data.userId as string | undefined
        const snap = getBridgeSnapshot()
        const targetUserId = data?.userId
        const personaId = data?.personaId
        if (
          !roomId ||
          !callerId ||
          !snap ||
          snap.roomId !== roomId ||
          typeof targetUserId !== "string" ||
          typeof personaId !== "string"
        ) {
          return
        }
        if (personaId !== "vip") {
          socket.emit("event", {
            type: "ERROR_OCCURRED",
            data: {
              status: 400,
              error: "Bad Request",
              message: "Only the VIP persona is supported in studio-bridge.",
            },
          })
          return
        }
        const caller = snap.users.find((u) => u.userId === callerId)
        if (!caller?.isAdmin) {
          socket.emit("event", {
            type: "ERROR_OCCURRED",
            data: {
              status: 403,
              error: "Forbidden",
              message: "Only room admins can toggle personas.",
            },
          })
          return
        }
        const { snap: nextSnap, user } = applyUserUpdateToSnapshot(
          snap,
          targetUserId,
          toggleVipOnUser,
        )
        if (!user) return
        setBridgeSnapshot(nextSnap)
        const personaEvent = userHasVip(user) ? "PERSONA_ASSIGNED" : "PERSONA_REMOVED"
        const roomPath = roomSocketPath(roomId)
        io.to(roomPath).emit("event", {
          type: personaEvent,
          data: {
            roomId,
            userId: targetUserId,
            personaId: "vip",
            user,
            users: nextSnap.users,
          },
        })
        io.to(roomPath).emit("event", {
          type: "USER_JOINED",
          data: { roomId, user, users: nextSnap.users },
        })
      },
    )

    socket.on("DESIGNATE_ADMIN", (targetUserId: string) => {
      const roomId = socket.data.roomId as string | undefined
      const snap = getBridgeSnapshot()
      if (!roomId || !snap || snap.roomId !== roomId || typeof targetUserId !== "string") {
        return
      }
      const { snap: nextSnap, user } = applyUserUpdateToSnapshot(snap, targetUserId, (u) => ({
        ...u,
        isAdmin: !u.isAdmin,
      }))
      if (!user) return
      setBridgeSnapshot(nextSnap)
      io.to(roomSocketPath(roomId)).emit("event", {
        type: "USER_JOINED",
        data: { roomId, user, users: nextSnap.users },
      })
    })

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

    socket.on("GET_ALL_LISTENER_GAME_STATES", () => {
      const roomId = socket.data.roomId as string | undefined
      const snap = getBridgeSnapshot()
      if (!roomId || !snap || snap.roomId !== roomId) {
        socket.emit("event", {
          type: "ALL_LISTENER_GAME_STATES",
          data: {
            session: null,
            listeners: [],
            itemDefinitions: [],
          },
        })
        return
      }
      socket.emit("event", {
        type: "ALL_LISTENER_GAME_STATES",
        data: buildAllListenerGameStatesPayload(snap),
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

    socket.on("REMOVE_FROM_QUEUE", async (data: { trackId?: string }) => {
      const roomId = socket.data.roomId as string | undefined
      const userId = socket.data.userId as string | undefined
      const trackId = typeof data?.trackId === "string" ? data.trackId : undefined
      const snap = getBridgeSnapshot()
      if (!roomId || !userId || !trackId || !snap || snap.roomId !== roomId) {
        socket.emit("event", {
          type: "REMOVE_FROM_QUEUE_FAILURE",
          data: {
            trackId: trackId ?? "",
            message: "Not in a room or missing track.",
          },
        })
        return
      }
      const roomUser = snap.users.find((u) => u.userId === userId)
      const isAdmin = roomUser?.isAdmin === true
      const forwarded = await forwardRoomUiCommandToStudio(io, roomId, {
        kind: "REMOVE_FROM_QUEUE",
        roomId,
        userId,
        trackId,
        isAdmin,
      })
      if (!forwarded) {
        socket.emit("event", {
          type: "REMOVE_FROM_QUEUE_FAILURE",
          data: {
            trackId,
            message:
              "Game Studio is not connected to the bridge. Run `make game-studio` and keep that tab open.",
          },
        })
      }
      /** Success/failure is emitted by Game Studio via POST `/preview/queue-remove-result`. */
    })

    socket.on(
      "EXECUTE_PLUGIN_ACTION",
      async (data: {
        pluginName?: string
        action?: string
        params?: Record<string, unknown>
      }) => {
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
          ...(data.params !== undefined ? { params: data.params } : {}),
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

    socket.on("CAST_POLL_VOTE", async (data: { pollId?: string; optionId?: string }) => {
      const roomId = socket.data.roomId as string | undefined
      const userId = socket.data.userId as string | undefined
      const pollId = typeof data?.pollId === "string" ? data.pollId : undefined
      const optionId = typeof data?.optionId === "string" ? data.optionId : undefined

      if (!roomId || !userId || !pollId || !optionId) {
        socket.emit("event", {
          type: "POLL_VOTE_FAILED",
          data: { pollId: pollId ?? "", reason: "UNAUTHORIZED" },
        })
        return
      }

      const ack = await forwardRoomUiCommandToStudioWithAck(io, roomId, {
        kind: "CAST_POLL_VOTE",
        roomId,
        userId,
        pollId,
        optionId,
      })

      if (!ack) {
        socket.emit("event", {
          type: "POLL_VOTE_FAILED",
          data: { pollId, reason: "POLL_NOT_FOUND" },
        })
        return
      }

      if (!ack.success) {
        socket.emit("event", {
          type: "POLL_VOTE_FAILED",
          data: { pollId, reason: ack.voteReason ?? "POLL_NOT_FOUND" },
        })
        return
      }

      socket.emit("event", {
        type: "POLL_VOTE_CONFIRMED",
        data: {
          pollId: ack.pollId ?? pollId,
          optionId: ack.optionId ?? optionId,
          isSwap: ack.isSwap === true,
        },
      })

      if (ack.isSwap !== true) {
        io.to(roomSocketPath(roomId)).emit("event", {
          type: "POLL_VOTE_CAST",
          data: {
            roomId,
            pollId: ack.pollId ?? pollId,
            totalVotes: ack.totalVotes ?? null,
          },
        })
      }
    })

    socket.on("CREATE_POLL", async (data: {
      question?: string
      options?: { label: string }[]
      settings?: { hideRunningTotal?: boolean }
    }) => {
      const roomId = socket.data.roomId as string | undefined
      const userId = socket.data.userId as string | undefined
      const snap = getBridgeSnapshot()

      if (!roomId || !userId || !snap || snap.roomId !== roomId) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 401,
            error: "Unauthorized",
            message: "You must be logged in to a room to create a poll.",
          },
        })
        return
      }

      const roomUser = snap.users.find((u) => u.userId === userId)
      if (!roomUser?.isAdmin) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 403,
            error: "Forbidden",
            message: "You are not a room admin.",
          },
        })
        return
      }

      const question = typeof data?.question === "string" ? data.question : ""
      const options = Array.isArray(data?.options) ? data.options : []

      const ack = await forwardRoomUiCommandToStudioWithAck(io, roomId, {
        kind: "CREATE_POLL",
        roomId,
        userId,
        question,
        options,
        ...(data?.settings !== undefined ? { settings: data.settings } : {}),
      })

      if (!ack) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 503,
            error: "Studio bridge",
            message: studioNotConnectedMessage(),
          },
        })
        return
      }

      if (!ack.success || !ack.poll) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: ack.message?.includes("already active") ? 409 : 400,
            error: ack.message?.includes("already active") ? "Conflict" : "Bad Request",
            message: ack.message ?? "Could not create poll.",
          },
        })
        return
      }

      io.to(roomSocketPath(roomId)).emit("event", {
        type: "POLL_PUBLISHED",
        data: { roomId, poll: ack.poll },
      })
    })

    socket.on("CLOSE_POLL", async (data: { pollId?: string }) => {
      const roomId = socket.data.roomId as string | undefined
      const userId = socket.data.userId as string | undefined
      const pollId = typeof data?.pollId === "string" ? data.pollId : undefined
      const snap = getBridgeSnapshot()

      if (!roomId || !userId || !pollId || !snap || snap.roomId !== roomId) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 401,
            error: "Unauthorized",
            message: "You must be logged in to a room to close a poll.",
          },
        })
        return
      }

      const roomUser = snap.users.find((u) => u.userId === userId)
      if (!roomUser?.isAdmin) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 403,
            error: "Forbidden",
            message: "You are not a room admin.",
          },
        })
        return
      }

      const ack = await forwardRoomUiCommandToStudioWithAck(io, roomId, {
        kind: "CLOSE_POLL",
        roomId,
        userId,
        pollId,
      })

      if (!ack) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 503,
            error: "Studio bridge",
            message: studioNotConnectedMessage(),
          },
        })
        return
      }

      if (!ack.success || !ack.closedPoll || !ack.results) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 400,
            error: "Bad Request",
            message: ack.message ?? "Could not close poll.",
          },
        })
        return
      }

      io.to(roomSocketPath(roomId)).emit("event", {
        type: "POLL_CLOSED",
        data: { roomId, poll: ack.closedPoll, results: ack.results },
      })
    })

    socket.on("DELETE_POLL", async (data: { pollId?: string }) => {
      const roomId = socket.data.roomId as string | undefined
      const userId = socket.data.userId as string | undefined
      const pollId = typeof data?.pollId === "string" ? data.pollId : undefined
      const snap = getBridgeSnapshot()

      if (!roomId || !userId || !pollId || !snap || snap.roomId !== roomId) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 401,
            error: "Unauthorized",
            message: "You must be logged in to a room to delete a poll.",
          },
        })
        return
      }

      const roomUser = snap.users.find((u) => u.userId === userId)
      if (!roomUser?.isAdmin) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 403,
            error: "Forbidden",
            message: "You are not a room admin.",
          },
        })
        return
      }

      const ack = await forwardRoomUiCommandToStudioWithAck(io, roomId, {
        kind: "DELETE_POLL",
        roomId,
        userId,
        pollId,
      })

      if (!ack) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 503,
            error: "Studio bridge",
            message: studioNotConnectedMessage(),
          },
        })
        return
      }

      if (!ack.success) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 404,
            error: "Not Found",
            message: ack.message ?? "Poll not found.",
          },
        })
        return
      }

      io.to(roomSocketPath(roomId)).emit("event", {
        type: "POLL_DELETED",
        data: { roomId, pollId: ack.deletedPollId ?? pollId },
      })
    })

    socket.on("GET_STORED_ARTIFACTS", () => {
      const snap = getBridgeSnapshot()
      socket.emit("event", {
        type: "STORED_ARTIFACTS_RESULT",
        data: { artifacts: snap?.storedArtifacts ?? [] },
      })
    })

    socket.on("RETRIEVE_STORED_ARTIFACT", async (data: { artifactId?: string; password?: string }) => {
      const roomId = socket.data.roomId as string | undefined
      const userId = socket.data.userId as string | undefined

      const fail = (message: string): void => {
        socket.emit("event", {
          type: "RETRIEVE_STORED_ARTIFACT_RESULT",
          data: { success: false, message },
        })
      }

      if (!roomId || !userId) {
        fail("Not in a room.")
        return
      }

      const artifactId = data?.artifactId?.trim()
      const password = typeof data?.password === "string" ? data.password : ""
      if (!artifactId || !password) {
        fail("Artifact id and password are required.")
        return
      }

      const studioSockets = await io.in(studioControlRoomPath(roomId)).fetchSockets()
      if (studioSockets.length === 0) {
        fail(
          "Game Studio is not connected to the bridge. Run `make game-studio` and keep that tab open.",
        )
        return
      }

      type StudioEmitWithAck = {
        emit: (ev: string, payload: unknown, ack?: (response: unknown) => void) => void
      }
      const toGameStudio = studioSockets[0]! as unknown as StudioEmitWithAck
      toGameStudio.emit(
        "event",
        {
          type: "STUDIO_BRIDGE_COMMAND",
          data: {
            kind: "RETRIEVE_STORED_ARTIFACT",
            roomId,
            userId,
            artifactId,
            password,
          },
        },
        (response: unknown) => {
          const r = response as { success?: boolean; message?: string } | undefined
          socket.emit("event", {
            type: "RETRIEVE_STORED_ARTIFACT_RESULT",
            data: {
              success: r?.success === true,
              message:
                r?.message ??
                (r?.success === true ? "Retrieved from storage." : "Could not retrieve."),
            },
          })
        },
      )
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
  if (o.storedArtifacts !== undefined && !Array.isArray(o.storedArtifacts)) return null

  const storedArtifacts = Array.isArray(o.storedArtifacts) ? o.storedArtifacts : []

  return {
    ...(body as BridgeSnapshot),
    storedArtifacts,
  }
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

/**
 * Game Studio reports queue removal outcome after mutating the sandbox (Listening Room awaits socket events).
 * Localhost-only — same origin as Game Studio → bridge POST /sync.
 */
app.post("/preview/queue-remove-result", (req, res) => {
  if (!io) {
    res.status(503).json({ error: "Server not ready" })
    return
  }
  const remote = req.socket.remoteAddress
  if (
    remote !== "127.0.0.1" &&
    remote !== "::1" &&
    remote !== "::ffff:127.0.0.1"
  ) {
    res.status(403).json({ error: "Forbidden" })
    return
  }
  const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : null
  const trackId = typeof req.body?.trackId === "string" ? req.body.trackId : null
  const success = req.body?.success === true
  const message = typeof req.body?.message === "string" ? req.body.message : undefined
  const trackTitle = typeof req.body?.trackTitle === "string" ? req.body.trackTitle : undefined
  if (!roomId || !trackId) {
    res.status(400).json({ error: "Expected roomId and trackId" })
    return
  }
  const path = roomSocketPath(roomId)
  if (success) {
    io.to(path).emit("event", {
      type: "REMOVE_FROM_QUEUE_SUCCESS",
      data: { trackId, trackTitle: trackTitle ?? "" },
    })
  } else {
    io.to(path).emit("event", {
      type: "REMOVE_FROM_QUEUE_FAILURE",
      data: { trackId, message: message ?? "Could not remove track from queue" },
    })
  }
  res.status(204).end()
})

httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`[studio-bridge] listening on http://127.0.0.1:${PORT}`)
})

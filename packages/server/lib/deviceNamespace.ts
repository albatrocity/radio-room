import { randomUUID } from "node:crypto"
import type { Server, Socket } from "socket.io"
import type { AppContext } from "@repo/types"
import {
  bindDeviceRoom,
  bridgeControlMessageSchema,
  bridgeEventSchema,
  deviceSocketRole,
  getOrCreateCapabilityCache,
  provisionSpotifyTokenForRoom,
  receiveDeviceLink,
  registerDeviceSocket,
  settleDeviceResponse,
  unregisterDeviceSocket,
  watchDeviceRoom,
} from "@repo/adapter-bridge"
import { activeSegmentForDevice } from "../operations/activeSegmentForDevice"
import {
  clearDevicePresence,
  writeDevicePresence,
  writeDeviceSpotifyId,
  writeDeviceTrackEnded,
} from "../operations/bridge/deviceBridgeState"
import { readDeviceSession, saveDeviceSession, touchDeviceSession } from "./deviceSessionStore"

const HEARTBEAT_MS = 3000
const heartbeats = new Map<string, NodeJS.Timeout>()

type DeviceSocket = Socket & {
  data: {
    daemonId?: string
    deviceToken?: string
    sessionRoomId?: string | null
    services?: string[]
  }
}

/**
 * Socket.IO namespace `/device`. bridge-daemon speaks BridgeRequest method names here.
 * The API writes presence, capabilities, last-ended, and the Spotify device id.
 * The daemon does not hold Redis.
 */
export function attachDeviceNamespace(io: Server, context: AppContext): void {
  const nsp = io.of("/device")

  nsp.use(async (socket, next) => {
    try {
      const secret = process.env.DEVICE_INGRESS_SECRET
      if (!secret) return next(new Error("device ingress not configured"))

      const auth = socket.handshake.auth ?? {}
      const daemonId = typeof auth.daemonId === "string" ? auth.daemonId.trim() : ""
      if (!daemonId) return next(new Error("daemonId required"))

      const token = typeof auth.token === "string" ? auth.token.trim() : ""
      const presented = typeof auth.secret === "string" ? auth.secret : ""
      const deviceSocket = socket as DeviceSocket

      if (token) {
        const session = await readDeviceSession(context.redis.pubClient, token)
        if (session && session.daemonId === daemonId) {
          deviceSocket.data.daemonId = daemonId
          deviceSocket.data.deviceToken = token
          deviceSocket.data.sessionRoomId = session.roomId
          return next()
        }
      }

      if (presented && presented === secret) {
        deviceSocket.data.daemonId = daemonId
        return next()
      }

      return next(new Error("unauthorized"))
    } catch (error) {
      next(error instanceof Error ? error : new Error("unauthorized"))
    }
  })

  nsp.on("connection", (socket) => {
    const deviceSocket = socket as DeviceSocket
    const daemonId = deviceSocket.data.daemonId
    if (!daemonId) {
      socket.disconnect(true)
      return
    }

    registerDeviceSocket({
      id: socket.id,
      daemonId,
      roomId: deviceSocket.data.sessionRoomId ?? null,
      emit: (event, payload) => {
        socket.emit(event, payload)
      },
    })
    console.log(`[device] connected daemon=${daemonId} socket=${socket.id}`)

    if (deviceSocket.data.sessionRoomId) {
      void bindRoom(deviceSocket, context, deviceSocket.data.sessionRoomId)
    }

    socket.on("response", (payload: unknown) => {
      settleDeviceResponse(payload)
    })

    socket.on("join", (payload: unknown) => {
      const roomId = readRoomId(payload)
      if (!roomId) return
      void bindRoom(deviceSocket, context, roomId)
    })

    socket.on("watch", (payload: unknown) => {
      const roomId = readRoomId(payload)
      if (!roomId) return
      watchDeviceRoom(socket.id, roomId)
      deviceSocket.data.sessionRoomId = roomId
      void pushSegmentSnapshot(context, socket, roomId)
    })

    socket.on("link", (payload: unknown) => {
      const parsed = bridgeControlMessageSchema.safeParse(payload)
      if (!parsed.success || parsed.data.type === "LINK_REQUEST") return
      const accepted = receiveDeviceLink(parsed.data)
      if (!accepted || parsed.data.type !== "LINK_ACK") return
      void bindRoom(deviceSocket, context, parsed.data.roomId)
    })

    socket.on("event", (payload: unknown) => {
      void onDeviceEvent(deviceSocket, context, payload)
    })

    socket.on("spotify-device", (payload: unknown) => {
      void onSpotifyDevice(deviceSocket, context, payload)
    })

    socket.on("disconnect", () => {
      void onDisconnect(deviceSocket, context)
    })
  })
}

async function bindRoom(socket: DeviceSocket, context: AppContext, roomId: string): Promise<void> {
  const previous = socket.data.sessionRoomId
  if (previous && previous !== roomId) {
    await clearDevicePresence(context, previous)
    getOrCreateCapabilityCache(context.redis.pubClient, previous).applyEvent({ type: "DISCONNECTING" })
  }

  bindDeviceRoom(socket.id, roomId)
  socket.data.sessionRoomId = roomId

  let token = socket.data.deviceToken
  if (!token) {
    token = randomUUID()
    socket.data.deviceToken = token
  }
  const daemonId = socket.data.daemonId
  if (!daemonId) return

  await saveDeviceSession(context.redis.pubClient, token, { daemonId, roomId })
  socket.emit("device-token", { token, roomId })
  await writeDevicePresence(context, roomId, socket.data.services)
  startHeartbeat(socket, context, roomId)
}

function startHeartbeat(socket: DeviceSocket, context: AppContext, roomId: string): void {
  stopHeartbeat(socket.id)
  const timer = setInterval(() => {
    void (async () => {
      if (socket.data.sessionRoomId !== roomId) return
      await writeDevicePresence(context, roomId, socket.data.services)
      if (socket.data.deviceToken) {
        await touchDeviceSession(context.redis.pubClient, socket.data.deviceToken).catch(() => {})
      }
    })()
  }, HEARTBEAT_MS)
  heartbeats.set(socket.id, timer)
}

function stopHeartbeat(socketId: string): void {
  const timer = heartbeats.get(socketId)
  if (!timer) return
  clearInterval(timer)
  heartbeats.delete(socketId)
}

async function onDeviceEvent(socket: DeviceSocket, context: AppContext, payload: unknown): Promise<void> {
  const roomId = socket.data.sessionRoomId
  if (!roomId) return
  const parsed = bridgeEventSchema.safeParse(payload)
  if (!parsed.success) return
  const event = parsed.data

  if (event.type === "DISCONNECTING") {
    await releaseRoom(socket, context)
    return
  }

  const cache = getOrCreateCapabilityCache(context.redis.pubClient, roomId)
  cache.applyEvent(event)

  if (event.type === "CAPABILITIES") {
    socket.data.services = event.services
    await writeDevicePresence(context, roomId, event.services)
  } else if (event.type === "ENDED") {
    await writeDeviceTrackEnded(context, roomId, {
      trackId: event.trackId,
      source: event.source,
      reason: event.reason,
    })
  } else if (event.type === "TOKEN_REQUEST") {
    await provisionSpotifyTokenForRoom({ context, roomId }).catch((error) => {
      console.error(`[device] TOKEN_REQUEST failed for ${roomId}:`, error)
    })
  }
}

async function onSpotifyDevice(socket: DeviceSocket, context: AppContext, payload: unknown): Promise<void> {
  const roomId = socket.data.sessionRoomId
  if (!roomId || !payload || typeof payload !== "object") return
  const deviceId = (payload as { deviceId?: unknown }).deviceId
  await writeDeviceSpotifyId(
    context,
    roomId,
    typeof deviceId === "string" && deviceId ? deviceId : null,
  )
}

async function onDisconnect(socket: DeviceSocket, context: AppContext): Promise<void> {
  console.log(`[device] disconnected daemon=${socket.data.daemonId ?? "?"} socket=${socket.id}`)
  await releaseRoom(socket, context)
  unregisterDeviceSocket(socket.id)
}

async function pushSegmentSnapshot(context: AppContext, socket: Socket, roomId: string): Promise<void> {
  const payload = await activeSegmentForDevice(context, roomId)
  socket.emit("segment", payload)
}

async function releaseRoom(socket: DeviceSocket, context: AppContext): Promise<void> {
  const roomId = socket.data.sessionRoomId
  const role = deviceSocketRole(socket.id)
  stopHeartbeat(socket.id)
  bindDeviceRoom(socket.id, null)
  socket.data.sessionRoomId = null
  if (!roomId || role === "segment") return
  getOrCreateCapabilityCache(context.redis.pubClient, roomId).applyEvent({ type: "DISCONNECTING" })
  await clearDevicePresence(context, roomId)
}

function readRoomId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const roomId = (payload as { roomId?: unknown }).roomId
  return typeof roomId === "string" ? roomId.trim() : ""
}

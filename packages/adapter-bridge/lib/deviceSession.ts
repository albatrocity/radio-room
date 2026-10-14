import { randomUUID } from "node:crypto"
import {
  BRIDGE_RPC_TIMEOUT_MS,
  bridgeResponseSchema,
  type BridgeControlMessage,
  type BridgeRequest,
  type BridgeResponse,
} from "./protocol"

export type DeviceSocketRecord = {
  id: string
  daemonId: string
  roomId: string | null
  emit: (event: string, payload: unknown) => void
}

const OFFLINE_MESSAGE =
  "No Media Bridge is online. Start the bridge daemon on the DJ Mac (`bridge-daemon serve`) aimed at this API, then try again."

const sockets = new Map<string, DeviceSocketRecord>()
const pending = new Map<
  string,
  { resolve: (value: BridgeResponse) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
>()

type LinkWait = {
  requestId: string
  roomId: string
  code: string
  timer: NodeJS.Timeout
  finish: (result: { ok: true; daemonId: string; roomId: string } | { ok: false; error: string }) => void
}

let linkWait: LinkWait | null = null

export function resetDeviceSessionsForTests(): void {
  pending.forEach((entry) => {
    clearTimeout(entry.timer)
    entry.reject(new Error("device session reset"))
  })
  pending.clear()
  sockets.clear()
  if (linkWait) {
    clearTimeout(linkWait.timer)
    linkWait.finish({ ok: false, error: "device session reset" })
    linkWait = null
  }
}

export function registerDeviceSocket(socket: DeviceSocketRecord): void {
  sockets.set(socket.id, socket)
}

export function unregisterDeviceSocket(id: string): DeviceSocketRecord | undefined {
  const existing = sockets.get(id)
  sockets.delete(id)
  return existing
}

export function bindDeviceRoom(id: string, roomId: string | null): void {
  const socket = sockets.get(id)
  if (!socket) return
  socket.roomId = roomId
}

export function deviceRoomPresent(roomId: string): boolean {
  return socketForRoom(roomId) != null
}

export function listConnectedDaemonIds(): string[] {
  return Array.from(sockets.values()).map((socket) => socket.daemonId)
}

export function emitToDeviceRoom(roomId: string, event: string, payload: unknown): boolean {
  const socket = socketForRoom(roomId)
  if (!socket) return false
  socket.emit(event, payload)
  return true
}

export function callDevice(
  roomId: string,
  method: BridgeRequest["method"],
  params: Record<string, unknown> = {},
  timeoutMs: number = BRIDGE_RPC_TIMEOUT_MS,
): Promise<unknown> {
  const socket = socketForRoom(roomId)
  if (!socket) {
    return Promise.reject(new Error(`Bridge daemon not connected for room ${roomId}`))
  }

  const id = randomUUID()
  const request: BridgeRequest = { id, method, params }
  const responsePromise = new Promise<BridgeResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Bridge RPC timeout: ${method}`))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
  })
  socket.emit("request", request)
  return responsePromise.then((response) => {
    if (!response.ok) {
      throw new Error(response.error ?? `Bridge RPC failed: ${method}`)
    }
    return response.result
  })
}

export function notifyDevice(
  roomId: string,
  method: BridgeRequest["method"],
  params: Record<string, unknown> = {},
): void {
  const socket = socketForRoom(roomId)
  if (!socket) return
  const request: BridgeRequest = { id: randomUUID(), method, params }
  socket.emit("request", request)
}

export function settleDeviceResponse(message: unknown): void {
  const result = bridgeResponseSchema.safeParse(message)
  if (!result.success) return
  const entry = pending.get(result.data.id)
  if (!entry) return
  clearTimeout(entry.timer)
  pending.delete(result.data.id)
  entry.resolve(result.data)
}

/**
 * Ask every connected device socket to link. Returns null when none are connected
 * so the Redis control channel can still serve an older pack.
 * The one-time `code` lives only in this process.
 */
export function beginDeviceLink(
  roomId: string,
  timeoutMs: number = BRIDGE_RPC_TIMEOUT_MS,
): Promise<{ ok: true; daemonId: string; roomId: string } | { ok: false; error: string }> | null {
  const targets = Array.from(sockets.values())
  if (targets.length === 0) return null

  if (linkWait) {
    clearTimeout(linkWait.timer)
    linkWait.finish({ ok: false, error: "superseded by a newer link request" })
    linkWait = null
  }

  const requestId = randomUUID()
  const code = randomUUID()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (linkWait?.requestId === requestId) linkWait = null
      resolve({ ok: false, error: OFFLINE_MESSAGE })
    }, timeoutMs)
    linkWait = {
      requestId,
      roomId,
      code,
      timer,
      finish: (result) => {
        if (linkWait?.requestId === requestId) linkWait = null
        resolve(result)
      },
    }
    const message: BridgeControlMessage = {
      type: "LINK_REQUEST",
      requestId,
      roomId,
      ts: Date.now(),
      code,
    }
    for (const target of targets) target.emit("link", message)
  })
}

/** True when this message settled the outstanding link (code matched). */
export function receiveDeviceLink(message: BridgeControlMessage): boolean {
  if (!linkWait) return false
  if (message.type === "LINK_REQUEST") return false
  if (message.requestId !== linkWait.requestId) return false
  if (!message.code || message.code !== linkWait.code) return false

  const finish = linkWait.finish
  clearTimeout(linkWait.timer)
  linkWait = null
  if (message.type === "LINK_ACK") {
    finish({ ok: true, daemonId: message.daemonId, roomId: message.roomId })
  } else {
    finish({ ok: false, error: message.error })
  }
  return true
}

function socketForRoom(roomId: string): DeviceSocketRecord | undefined {
  let found: DeviceSocketRecord | undefined
  sockets.forEach((socket) => {
    if (!found && socket.roomId === roomId) found = socket
  })
  return found
}

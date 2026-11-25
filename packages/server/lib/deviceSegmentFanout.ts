import { randomUUID } from "node:crypto"
import type { Namespace } from "socket.io"
import type { RedisContext } from "@repo/types"
import { emitToDeviceSockets } from "@repo/adapter-bridge"

/** Socket.IO room on `/device`. The Redis adapter delivers across API processes. */
const SEGMENT_ROOM_PREFIX = "segment:"
/** Each API process subscribes and emits on its own device sockets. */
const SEGMENT_BUS_CHANNEL = "device:segment-cue"

const origin = randomUUID()

type CueMessage = {
  origin: string
  roomId: string
  payload: unknown
}

let deviceNamespace: Namespace | null = null
let publisher: RedisContext["pubClient"] | null = null
let busStarted = false

export function deviceSegmentRoom(roomId: string): string {
  return `${SEGMENT_ROOM_PREFIX}${roomId}`
}

export function bindDeviceNamespace(namespace: Namespace): void {
  deviceNamespace = namespace
}

/**
 * Subscribe so a cue published by another API process is emitted on the
 * sockets this process accepted. Our own publish is skipped by `origin`.
 */
export async function startDeviceSegmentBus(redis: RedisContext): Promise<void> {
  if (busStarted) return
  busStarted = true
  try {
    await connectDeviceSegmentBus(redis)
  } catch (error) {
    busStarted = false
    publisher = null
    throw error
  }
}

async function connectDeviceSegmentBus(redis: RedisContext): Promise<void> {
  const sub = redis.pubClient.duplicate()
  await sub.connect()
  await sub.subscribe(SEGMENT_BUS_CHANNEL, (message) => {
    let parsed: CueMessage
    try {
      parsed = JSON.parse(message) as CueMessage
    } catch {
      return
    }
    if (!parsed || parsed.origin === origin || typeof parsed.roomId !== "string") return
    const delivered = emitToDeviceSockets(parsed.roomId, "segment", parsed.payload)
    if (delivered > 0) {
      console.log(
        `[device] segment cue from peer room=${parsed.roomId} segment=${segmentIdOf(parsed.payload)} localSockets=${delivered}`,
      )
    }
  })
  publisher = redis.pubClient
}

export function resetDeviceNamespaceForTests(): void {
  deviceNamespace = null
  publisher = null
  busStarted = false
}

/**
 * Push a segment cue to every `/device` socket watching this room.
 * The in-process map is the path for the process that accepted `watch`.
 * The socket.io room and `device:segment-cue` cover a socket on another
 * API process. The Mac drops a second copy of the same `at`.
 */
export function emitDeviceSegment(roomId: string, payload: unknown): void {
  const local = emitToDeviceSockets(roomId, "segment", payload)
  if (deviceNamespace) {
    deviceNamespace.to(deviceSegmentRoom(roomId)).emit("segment", payload)
  }
  if (publisher) {
    const message = JSON.stringify({ origin, roomId, payload } satisfies CueMessage)
    void publisher.publish(SEGMENT_BUS_CHANNEL, message).catch((error) => {
      console.error("[device] segment cue publish failed", error)
    })
  }
  console.log(
    `[device] segment cue room=${roomId} segment=${segmentIdOf(payload)} localSockets=${local}`,
  )
}

function segmentIdOf(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const segmentId = (payload as { segmentId?: unknown }).segmentId
  return typeof segmentId === "string" ? segmentId : ""
}

import type { SystemEventName, SystemEventPayload } from "@repo/types"
import { emitToDeviceSockets } from "@repo/adapter-bridge"
import type { Broadcaster } from "./Broadcaster"

/**
 * Pushes SEGMENT_ACTIVATED onto `/device` sockets joined to the room.
 * local-remote uses this for Farrago theme songs. The cue is the activation
 * itself, not a later poll.
 */
export class DeviceSegmentBroadcaster implements Broadcaster {
  readonly name = "device-segment"

  handleEvent<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void {
    if (event !== "SEGMENT_ACTIVATED") return
    emitToDeviceSockets(roomId, "segment", { ...data, at: Date.now() })
  }
}

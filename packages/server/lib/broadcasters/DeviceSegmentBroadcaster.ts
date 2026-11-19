import type { SystemEventName, SystemEventPayload } from "@repo/types"
import type { Broadcaster } from "./Broadcaster"
import { emitDeviceSegment } from "../deviceSegmentFanout"

/**
 * Pushes SEGMENT_ACTIVATED onto `/device` sockets watching the room.
 * local-remote uses this for Farrago theme songs. `cue: "activation"` is a
 * new press, including a repeat of the segment that is already on.
 */
export class DeviceSegmentBroadcaster implements Broadcaster {
  readonly name = "device-segment"

  handleEvent<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void {
    if (event !== "SEGMENT_ACTIVATED") return
    emitDeviceSegment(roomId, { ...data, at: Date.now(), cue: "activation" })
  }
}

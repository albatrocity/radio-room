import type { MediaSourceAdapter } from "@repo/types"
import { RtmpRoomSubscriber } from "./lib/redisSubscriber"

const roomSubscribers = new Map<string, RtmpRoomSubscriber>()

export const mediaSource: MediaSourceAdapter = {
  register: async (config) => {
    const { authentication, name, onRegistered } = config

    onRegistered?.({ name })

    return {
      name,
      authentication,
    }
  },

  onRoomCreated: async ({ roomId, roomType, context }) => {
    if (roomType !== "live") return

    console.log(`[adapter-rtmp] Setting up Redis subscriber for live room ${roomId}`)

    if (roomSubscribers.has(roomId)) {
      console.log(`[adapter-rtmp] Subscriber for room ${roomId} already exists, skipping`)
      return
    }

    const { createJobApi } = await import("@repo/server/lib/createJobApi")
    const api = createJobApi(context)

    const subscriber = new RtmpRoomSubscriber(roomId, context, api)
    roomSubscribers.set(roomId, subscriber)
    await subscriber.start()
  },

  onRoomDeleted: async ({ roomId }) => {
    console.log(`[adapter-rtmp] Cleaning up subscriber for room ${roomId}`)

    const subscriber = roomSubscribers.get(roomId)
    if (subscriber) {
      await subscriber.stop()
      roomSubscribers.delete(roomId)
    }
  },
}

import {
  bridgeControlMessageSchema,
  type BridgeControlMessage,
} from "@repo/adapter-bridge/protocol"

export type StandbyHandlers = {
  getConnectedRoomId: () => string | null
  connect: (roomId: string) => Promise<void>
}

/**
 * Standby link handler for the /device socket.
 * LINK_REQUEST arrives on the socket; ACK/NACK go back on the same socket.
 */
export class StandbyControl {
  private linking = false

  constructor(
    private readonly daemonId: string,
    private readonly handlers: StandbyHandlers,
    private readonly send: (msg: BridgeControlMessage) => void,
  ) {}

  getDaemonId(): string {
    return this.daemonId
  }

  async handleMessage(message: unknown): Promise<void> {
    const result = bridgeControlMessageSchema.safeParse(message)
    if (!result.success) return
    const msg = result.data
    if (msg.type !== "LINK_REQUEST") return

    if (this.linking) {
      this.send({
        type: "LINK_NACK",
        requestId: msg.requestId,
        roomId: msg.roomId,
        ok: false,
        error: "Media Bridge is already handling a link request",
        daemonId: this.daemonId,
        code: msg.code,
      })
      return
    }

    this.linking = true
    console.log(`[standby] LINK_REQUEST room=${msg.roomId} requestId=${msg.requestId}`)
    try {
      await this.handlers.connect(msg.roomId)
      this.send({
        type: "LINK_ACK",
        requestId: msg.requestId,
        roomId: msg.roomId,
        ok: true,
        daemonId: this.daemonId,
        code: msg.code,
      })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      console.error(`[standby] LINK_REQUEST failed:`, e)
      this.send({
        type: "LINK_NACK",
        requestId: msg.requestId,
        roomId: msg.roomId,
        ok: false,
        error,
        daemonId: this.daemonId,
        code: msg.code,
      })
    } finally {
      this.linking = false
    }
  }
}

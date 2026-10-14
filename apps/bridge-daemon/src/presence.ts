import type { BridgeEvent } from "@repo/adapter-bridge/protocol"

/**
 * Forwards daemon events onto the device socket. The API writes presence keys.
 */
export class Presence {
  private timer: NodeJS.Timeout | null = null
  private services: string[] = []

  constructor(
    private readonly emit: (event: BridgeEvent) => void,
    private readonly roomId: string,
  ) {}

  async start(services: string[]): Promise<void> {
    this.services = [...services]
    this.timer = setInterval(() => {
      this.emit({ type: "CAPABILITIES", services: this.services })
    }, 3000)
    await this.publish({ type: "CAPABILITIES", services: this.services })
  }

  async publish(event: BridgeEvent): Promise<void> {
    if (event.type === "ENDED") {
      console.log(
        `[presence] ENDED source=${event.source} trackId=${event.trackId} reason=${event.reason ?? "none"} room=${this.roomId}`,
      )
    }
    this.emit(event)
  }

  async disconnecting(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.publish({ type: "DISCONNECTING" })
  }
}

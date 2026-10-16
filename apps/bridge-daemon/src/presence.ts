import type { BridgeEvent } from "@repo/adapter-bridge/protocol"

/**
 * Forwards daemon events onto the device socket. The API writes presence keys
 * and refreshes their TTL. CAPABILITIES is sent at start and again when the
 * socket reconnects, so a new API process learns the service list. Repeats of
 * the same list do not notify capability listeners.
 */
export class Presence {
  private services: string[] = []
  private started = false

  constructor(
    private readonly emit: (event: BridgeEvent) => void,
    private readonly roomId: string,
  ) {}

  async start(services: string[]): Promise<void> {
    this.services = [...services]
    this.started = true
    await this.publish({ type: "CAPABILITIES", services: this.services })
  }

  /** Re-send the current service list after the device socket connects. */
  announce(): void {
    if (!this.started) return
    this.emit({ type: "CAPABILITIES", services: this.services })
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
    await this.publish({ type: "DISCONNECTING" })
  }
}

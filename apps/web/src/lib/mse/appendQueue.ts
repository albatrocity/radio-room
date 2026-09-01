/**
 * Serializes SourceBuffer append/remove operations — appendBuffer throws if updating.
 */

export type AppendQueueOp =
  | { type: "append"; data: Uint8Array<ArrayBuffer> }
  | { type: "remove"; start: number; end: number }

export class AppendQueue {
  private queue: AppendQueueOp[] = []
  private onError: (message: string) => void

  constructor(
    private sb: SourceBuffer,
    onError: (message: string) => void,
  ) {
    this.onError = onError
    this.sb.addEventListener("updateend", () => this.drain())
    this.sb.addEventListener("error", () => this.onError("sourcebuffer error"))
  }

  append(data: Uint8Array<ArrayBuffer>): void {
    this.queue.push({ type: "append", data })
    this.drain()
  }

  remove(start: number, end: number): void {
    this.queue.push({ type: "remove", start, end })
    this.drain()
  }

  clear(): void {
    this.queue = []
  }

  private drain(): void {
    if (this.sb.updating || this.queue.length === 0) return
    const op = this.queue.shift()
    if (!op) return
    try {
      if (op.type === "append") {
        this.sb.appendBuffer(op.data)
      } else {
        this.sb.remove(op.start, op.end)
      }
    } catch (error) {
      const name = error instanceof DOMException ? error.name : String(error)
      if (op.type === "append" && name === "QuotaExceededError") {
        this.onError("quotaExceeded")
        return
      }
      this.onError("appendBuffer failed: " + String(error))
    }
  }
}

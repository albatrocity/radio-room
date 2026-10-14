/**
 * Thrown when a plugin writes the core queue from inside `SystemEvents.emit`.
 * Queue follow-ups run before emit; handlers must not call the queue mutators.
 */
export class QueueMutationDuringEmitError extends Error {
  readonly roomId: string

  constructor(roomId: string) {
    super(
      `Cannot mutate the queue while system events are being delivered to plugins (room ${roomId}). Propose a queue follow-up instead.`,
    )
    this.name = "QueueMutationDuringEmitError"
    this.roomId = roomId
  }
}

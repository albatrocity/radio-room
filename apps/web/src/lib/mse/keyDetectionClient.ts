/**
 * Main-thread handle for the Chromatic Tuner key-detection Worker (ADR 0171).
 * Spawned only when the owner-gated ChromaticTuner component mounts.
 */

import type { DetectedKey } from "./keyDetectionTypes"

type WorkerIn =
  | { type: "preload" }
  | {
      type: "analyze"
      requestId: number
      samples: Float32Array
      sampleRate: number
    }

type WorkerOut =
  | { type: "ready" }
  | { type: "result"; requestId: number; result: DetectedKey | null }
  | { type: "error"; requestId?: number; message: string }

export type KeyDetectionWorkerHandle = {
  analyze: (
    samples: Float32Array,
    sampleRate: number,
  ) => Promise<DetectedKey | null>
  terminate: () => void
}

/**
 * Create the module Worker and kick a preload so MIR parse overlaps the
 * "Detecting key…" spinner. Safe to call only from ChromaticTuner mount.
 */
export function createKeyDetectionWorker(): KeyDetectionWorkerHandle {
  const worker = new Worker(new URL("./keyDetection.worker.ts", import.meta.url), {
    type: "module",
  })

  let nextId = 1
  const pending = new Map<
    number,
    {
      resolve: (value: DetectedKey | null) => void
      reject: (reason?: unknown) => void
    }
  >()

  worker.onmessage = (event: MessageEvent<WorkerOut>) => {
    const msg = event.data
    if (!msg || typeof msg !== "object") return
    if (msg.type === "ready") return
    if (msg.type === "error") {
      if (msg.requestId != null) {
        const p = pending.get(msg.requestId)
        if (p) {
          pending.delete(msg.requestId)
          p.resolve(null)
        }
      }
      return
    }
    if (msg.type === "result") {
      const p = pending.get(msg.requestId)
      if (p) {
        pending.delete(msg.requestId)
        p.resolve(msg.result)
      }
    }
  }

  worker.onerror = () => {
    for (const [, p] of pending) p.resolve(null)
    pending.clear()
  }

  worker.postMessage({ type: "preload" } satisfies WorkerIn)

  return {
    analyze(samples, sampleRate) {
      const requestId = nextId++
      return new Promise<DetectedKey | null>((resolve, reject) => {
        pending.set(requestId, { resolve, reject })
        // Transfer the copy so the Worker owns the buffer; never transfer the
        // shared analysis ring (caller must pass a dedicated Float32Array).
        const message: WorkerIn = {
          type: "analyze",
          requestId,
          samples,
          sampleRate,
        }
        worker.postMessage(message, [samples.buffer])
      })
    },
    terminate() {
      for (const [, p] of pending) p.resolve(null)
      pending.clear()
      worker.terminate()
    },
  }
}

/** Kick Worker construction early from ChromaticTuner mount (no-op if unused). */
export function preloadKeyDetectionWorker(): KeyDetectionWorkerHandle {
  return createKeyDetectionWorker()
}

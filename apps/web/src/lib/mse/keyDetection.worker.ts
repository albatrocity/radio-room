/**
 * Module Worker for Chromatic Tuner key detection (ADR 0171).
 * Dynamically imports @audio/mir-chroma / @audio/mir-key on first use so
 * non-owners never download those chunks from the main bundle graph.
 */

import { detectKeyFromPcmWithFns } from "./keyFromPcm"
import type { DetectedKey } from "./keyDetectionTypes"

type ChromaFn = (
  data: Float32Array | Float64Array,
  options?: { fs?: number; method?: "pcp" | "nnls" },
) => Float64Array

type KeyFn = (input: Float64Array | Float64Array[]) => {
  tonic: number
  mode: "major" | "minor"
  label: string
  confidence: number
  scores: { label: string; score: number }[]
}

type InMessage =
  | { type: "preload" }
  | {
      type: "analyze"
      requestId: number
      samples: Float32Array
      sampleRate: number
    }

type OutMessage =
  | { type: "ready" }
  | {
      type: "result"
      requestId: number
      result: DetectedKey | null
    }
  | { type: "error"; requestId?: number; message: string }

let chromaFn: ChromaFn | null = null
let keyFn: KeyFn | null = null
let loadPromise: Promise<void> | null = null

async function ensureMir(): Promise<void> {
  if (chromaFn && keyFn) return
  if (!loadPromise) {
    loadPromise = (async () => {
      const [{ default: chroma }, { default: key }] = await Promise.all([
        import("@audio/mir-chroma"),
        import("@audio/mir-key"),
      ])
      chromaFn = chroma
      keyFn = key
    })()
  }
  await loadPromise
}

function post(msg: OutMessage): void {
  self.postMessage(msg)
}

self.onmessage = (event: MessageEvent<InMessage>) => {
  const data = event.data
  if (!data || typeof data !== "object") return

  if (data.type === "preload") {
    void ensureMir()
      .then(() => post({ type: "ready" }))
      .catch((err: unknown) => {
        post({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to load key library",
        })
      })
    return
  }

  if (data.type !== "analyze") return

  const { requestId, samples, sampleRate } = data
  void (async () => {
    try {
      await ensureMir()
      if (!chromaFn || !keyFn) {
        post({ type: "error", requestId, message: "Key library not ready" })
        return
      }
      const result = detectKeyFromPcmWithFns(samples, sampleRate, chromaFn, keyFn)
      post({ type: "result", requestId, result })
    } catch (err: unknown) {
      post({
        type: "error",
        requestId,
        message: err instanceof Error ? err.message : "Key analysis failed",
      })
    }
  })()
}

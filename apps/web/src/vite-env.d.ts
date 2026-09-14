/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SOCKET_URL: string
  readonly VITE_VOICEMAIL_NUMBER?: string
  readonly VITE_CONTACT_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * @audio/mir-* ship `types`/`index.d.ts`, but `exports["."]` omits a `types`
 * condition, so TS under bundler resolution needs these ambient shims.
 */
declare module "@audio/mir-chroma" {
  export interface ChromaOptions {
    fs?: number
    method?: "pcp" | "nnls"
    minFreq?: number
    maxFreq?: number
    harmonics?: number
    iterations?: number
  }
  export default function chroma(
    data: Float32Array | Float64Array,
    options?: ChromaOptions,
  ): Float64Array
}

declare module "@audio/mir-key" {
  export type ChromaVec = Float64Array | Float32Array | number[]
  export const KK_MAJOR: number[]
  export const KK_MINOR: number[]
  export interface KeyProfile {
    major: number[]
    minor: number[]
  }
  export interface KeyOptions {
    profile?: KeyProfile
  }
  export interface KeyScore {
    label: string
    score: number
  }
  export interface KeyResult {
    tonic: number
    mode: "major" | "minor"
    label: string
    confidence: number
    scores: KeyScore[]
  }
  export default function key(
    input: ChromaVec | ChromaVec[],
    params?: KeyOptions,
  ): KeyResult
}

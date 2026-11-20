/**
 * Pure helpers for the voicemail telephone-band pass (ADR 0212, ADR 0214,
 * plan phase 3). Kept side-effect free and DOM-free so the AudioWorklet in
 * voicemailTelephoneWorklet.js can mirror the exact same math and so a Node
 * test runner can exercise it without an AudioContext.
 *
 * Pipeline shape:
 *
 *   Float32 mono PCM at the AudioContext rate (typically 48 kHz)
 *     -> cascaded 3400 Hz low-pass  (anti-alias before decimation)
 *     -> decimate to 8000 Hz        (telephone channel)
 *     -> cascaded 300 Hz high-pass  (telephone band low corner)
 *     -> G.711 μ-law encode + decode  (companding grit)
 *     -> zero-order hold back up to the AudioContext rate
 *     -> Float32 mono PCM
 *
 * The LPF and HPF are each one biquad; cascading two gives a 4th-order
 * Butterworth-like response at Q = 1/√2 so the telephone band (300–3400 Hz)
 * has steep enough skirts that a 1 kHz tone survives and a 6 kHz tone does
 * not. The μ-law stage uses the ITU-T G.711 integer code so a quiet sample
 * collapses to the standard segment-0 step size.
 */

export const PHONE_SAMPLE_RATE = 8000
export const PHONE_LOW_HZ = 300
export const PHONE_HIGH_HZ = 3400
export const BIQUAD_Q = Math.SQRT1_2 // ≈ 0.7071, Butterworth

// --------------------------------------------------------------------------
// Biquad (RBJ Audio EQ Cookbook, Transposed Direct Form II)
// --------------------------------------------------------------------------

export interface BiquadCoeffs {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

export interface BiquadState {
  z1: number
  z2: number
}

export function createBiquadState(): BiquadState {
  return { z1: 0, z2: 0 }
}

export function lowPassCoeffs(
  fc: number,
  fs: number,
  q: number = BIQUAD_Q,
): BiquadCoeffs {
  const w0 = 2 * Math.PI * (fc / fs)
  const cosw = Math.cos(w0)
  const sinw = Math.sin(w0)
  const alpha = sinw / (2 * q)
  const a0 = 1 + alpha
  return {
    b0: (1 - cosw) / 2 / a0,
    b1: (1 - cosw) / a0,
    b2: (1 - cosw) / 2 / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  }
}

export function highPassCoeffs(
  fc: number,
  fs: number,
  q: number = BIQUAD_Q,
): BiquadCoeffs {
  const w0 = 2 * Math.PI * (fc / fs)
  const cosw = Math.cos(w0)
  const sinw = Math.sin(w0)
  const alpha = sinw / (2 * q)
  const a0 = 1 + alpha
  return {
    b0: (1 + cosw) / 2 / a0,
    b1: -(1 + cosw) / a0,
    b2: (1 + cosw) / 2 / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  }
}

/** Apply one biquad step (Transposed Direct Form II) in-place on `state`. */
export function biquadStep(
  c: BiquadCoeffs,
  state: BiquadState,
  x: number,
): number {
  const y = c.b0 * x + state.z1
  state.z1 = c.b1 * x - c.a1 * y + state.z2
  state.z2 = c.b2 * x - c.a2 * y
  return y
}

export function applyBiquad(
  input: Float32Array,
  c: BiquadCoeffs,
  state: BiquadState = createBiquadState(),
): Float32Array {
  const out = new Float32Array(input.length)
  for (let i = 0; i < input.length; i++) {
    out[i] = biquadStep(c, state, input[i]!)
  }
  return out
}

// --------------------------------------------------------------------------
// G.711 μ-law (ITU-T), 14-bit PCM domain
// --------------------------------------------------------------------------

const MU_LAW_BIAS = 0x84 // 132
const MU_LAW_CLIP = 32635 // 32767 - BIAS

/** Encode a 14-bit linear PCM sample (int) to an 8-bit μ-law byte. */
export function muLawEncodeInt(pcm: number): number {
  let abs = pcm < 0 ? -pcm : pcm
  const sign = pcm < 0 ? 0x80 : 0
  if (abs > MU_LAW_CLIP) abs = MU_LAW_CLIP
  abs += MU_LAW_BIAS
  let exponent = 7
  let mask = 0x4000
  while ((abs & mask) === 0 && exponent > 0) {
    exponent--
    mask >>= 1
  }
  const mantissa = (abs >> (exponent + 3)) & 0x0f
  return (~(sign | (exponent << 4) | mantissa)) & 0xff
}

/** Decode an 8-bit μ-law byte to its 14-bit linear PCM sample (int). */
export function muLawDecodeInt(byte: number): number {
  const inv = ~byte & 0xff
  const sign = inv & 0x80
  const exponent = (inv >> 4) & 0x07
  const mantissa = inv & 0x0f
  let pcm = ((mantissa << 3) + MU_LAW_BIAS) << exponent
  pcm -= MU_LAW_BIAS
  return sign ? -pcm : pcm
}

/** Float [-1, 1] sample -> μ-law byte. */
export function muLawEncodeSample(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample))
  return muLawEncodeInt(Math.round(clamped * 32767))
}

/** μ-law byte -> float sample in roughly [-1, 1]. */
export function muLawDecodeByte(byte: number): number {
  return muLawDecodeInt(byte) / 32768
}

/** Encode + decode a single float sample. */
export function muLawRoundTrip(sample: number): number {
  return muLawDecodeByte(muLawEncodeSample(sample))
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Average any number of per-channel buffers into a mono buffer. */
export function mixToMono(buffers: Float32Array[]): Float32Array {
  if (buffers.length === 0) return new Float32Array(0)
  const length = buffers[0]!.length
  if (buffers.length === 1) return buffers[0]!.slice()
  const out = new Float32Array(length)
  const scale = 1 / buffers.length
  for (let i = 0; i < length; i++) {
    let s = 0
    for (let c = 0; c < buffers.length; c++) s += buffers[c]![i]!
    out[i] = s * scale
  }
  return out
}

// --------------------------------------------------------------------------
// End-to-end telephone band pass (pure, streamable)
// --------------------------------------------------------------------------

export interface TelephonePipelineState {
  lpfA: BiquadState
  lpfB: BiquadState
  hpfA: BiquadState
  hpfB: BiquadState
  decimPhase: number
  heldSample: number
}

export function createTelephonePipelineState(): TelephonePipelineState {
  return {
    lpfA: createBiquadState(),
    lpfB: createBiquadState(),
    hpfA: createBiquadState(),
    hpfB: createBiquadState(),
    decimPhase: 0,
    heldSample: 0,
  }
}

/**
 * Apply the full telephone band pass to a mono buffer sampled at
 * `inputRate`. Returns a new Float32Array the same length as the input (the
 * decimated samples are zero-order-held back up to `inputRate` so a
 * downstream MediaRecorder keeps its native clock).
 *
 * Pass a persistent `state` across calls to stream chunk-by-chunk; omit it
 * to process a standalone buffer (e.g. in tests).
 */
export function applyTelephoneBandPass(
  mono: Float32Array,
  inputRate: number,
  state: TelephonePipelineState = createTelephonePipelineState(),
): Float32Array {
  const lpfCoeffs = lowPassCoeffs(PHONE_HIGH_HZ, inputRate)
  const hpfCoeffs = highPassCoeffs(PHONE_LOW_HZ, PHONE_SAMPLE_RATE)
  const decimRatio = inputRate / PHONE_SAMPLE_RATE
  const out = new Float32Array(mono.length)

  for (let i = 0; i < mono.length; i++) {
    const lp1 = biquadStep(lpfCoeffs, state.lpfA, mono[i]!)
    const lp2 = biquadStep(lpfCoeffs, state.lpfB, lp1)

    state.decimPhase += 1
    if (state.decimPhase >= decimRatio) {
      state.decimPhase -= decimRatio
      const hp1 = biquadStep(hpfCoeffs, state.hpfA, lp2)
      const hp2 = biquadStep(hpfCoeffs, state.hpfB, hp1)
      state.heldSample = muLawRoundTrip(hp2)
    }
    out[i] = state.heldSample
  }

  return out
}

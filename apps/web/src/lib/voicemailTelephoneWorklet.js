/**
 * AudioWorklet processor that mirrors voicemailTelephoneBand.ts exactly:
 *   mono mix -> 2x low-pass @ 3400 Hz at the AudioContext rate -> decimate to
 *   8 kHz -> 2x high-pass @ 300 Hz at 8 kHz -> G.711 μ-law round trip ->
 *   zero-order hold back up to the AudioContext rate.
 *
 * This file is loaded via `audioWorklet.addModule()`, which evaluates it as a
 * classic script in the AudioWorklet global scope. No ES import/export, no
 * cross-file sharing — the helper module and this file have to be kept in
 * sync by hand (see ADR 0214 and the voicemailTelephoneBand unit tests).
 */

/* eslint-disable no-undef */

const PHONE_SAMPLE_RATE = 8000
const PHONE_LOW_HZ = 300
const PHONE_HIGH_HZ = 3400
const BIQUAD_Q = Math.SQRT1_2

const MU_LAW_BIAS = 0x84
const MU_LAW_CLIP = 32635

function lowPassCoeffs(fc, fs, q) {
  const w0 = 2 * Math.PI * (fc / fs)
  const cosw = Math.cos(w0)
  const sinw = Math.sin(w0)
  const alpha = sinw / (2 * q)
  const a0 = 1 + alpha
  return {
    b0: ((1 - cosw) / 2) / a0,
    b1: (1 - cosw) / a0,
    b2: ((1 - cosw) / 2) / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  }
}

function highPassCoeffs(fc, fs, q) {
  const w0 = 2 * Math.PI * (fc / fs)
  const cosw = Math.cos(w0)
  const sinw = Math.sin(w0)
  const alpha = sinw / (2 * q)
  const a0 = 1 + alpha
  return {
    b0: ((1 + cosw) / 2) / a0,
    b1: -(1 + cosw) / a0,
    b2: ((1 + cosw) / 2) / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  }
}

function biquadStep(c, s, x) {
  const y = c.b0 * x + s.z1
  s.z1 = c.b1 * x - c.a1 * y + s.z2
  s.z2 = c.b2 * x - c.a2 * y
  return y
}

function muLawRoundTrip(sample) {
  let pcm = Math.round(Math.max(-1, Math.min(1, sample)) * 32767)
  const sign = pcm < 0 ? 0x80 : 0
  if (sign) pcm = -pcm
  if (pcm > MU_LAW_CLIP) pcm = MU_LAW_CLIP
  pcm += MU_LAW_BIAS
  let exponent = 7
  let mask = 0x4000
  while ((pcm & mask) === 0 && exponent > 0) {
    exponent--
    mask >>= 1
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f
  const byte = (~(sign | (exponent << 4) | mantissa)) & 0xff

  const inv = ~byte & 0xff
  const dsign = inv & 0x80
  const dexp = (inv >> 4) & 0x07
  const dman = inv & 0x0f
  let dpcm = ((dman << 3) + MU_LAW_BIAS) << dexp
  dpcm -= MU_LAW_BIAS
  return (dsign ? -dpcm : dpcm) / 32768
}

class TelephoneBandProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.lpfCoeffs = lowPassCoeffs(PHONE_HIGH_HZ, sampleRate, BIQUAD_Q)
    this.hpfCoeffs = highPassCoeffs(PHONE_LOW_HZ, PHONE_SAMPLE_RATE, BIQUAD_Q)
    this.decimRatio = sampleRate / PHONE_SAMPLE_RATE
    this.lpfA = { z1: 0, z2: 0 }
    this.lpfB = { z1: 0, z2: 0 }
    this.hpfA = { z1: 0, z2: 0 }
    this.hpfB = { z1: 0, z2: 0 }
    this.decimPhase = 0
    this.heldSample = 0
  }

  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]
    if (!input || input.length === 0 || !output || output.length === 0) {
      return true
    }
    const chanL = input[0]
    if (!chanL) return true
    const chanR = input[1] || chanL
    const outL = output[0]
    const outR = output[1]
    const frames = chanL.length

    for (let i = 0; i < frames; i++) {
      const mono = (chanL[i] + chanR[i]) * 0.5
      const lp1 = biquadStep(this.lpfCoeffs, this.lpfA, mono)
      const lp2 = biquadStep(this.lpfCoeffs, this.lpfB, lp1)

      this.decimPhase += 1
      if (this.decimPhase >= this.decimRatio) {
        this.decimPhase -= this.decimRatio
        const hp1 = biquadStep(this.hpfCoeffs, this.hpfA, lp2)
        const hp2 = biquadStep(this.hpfCoeffs, this.hpfB, hp1)
        this.heldSample = muLawRoundTrip(hp2)
      }

      outL[i] = this.heldSample
      if (outR) outR[i] = this.heldSample
    }
    return true
  }
}

registerProcessor("voicemail-telephone-band", TelephoneBandProcessor)

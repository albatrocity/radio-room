/**
 * Thin, UI-agnostic wrapper around `getUserMedia` + AudioWorklet (or a
 * cascaded BiquadFilter fallback) + `MediaRecorder` for the lobby voicemail
 * recorder (ADR 0212 / 0214, plan phase 3).
 *
 * Why a separate module from the React component:
 *   - lets the component be short and declarative,
 *   - keeps the DOM glue out of the pure band-pass helper,
 *   - mirrors the µ-law + biquad choices in voicemailTelephoneBand.ts and
 *     voicemailTelephoneWorklet.js exactly.
 *
 * Output guarantees: the resolved blob's base MIME is always one of the
 * three types the API accepts (`audio/webm` / `audio/mp4` / `audio/ogg`) and
 * matches `contentType`, so the presign PUT can send exact signed headers.
 */

import fixWebmDuration from "fix-webm-duration"

import {
  BIQUAD_Q,
  PHONE_HIGH_HZ,
  PHONE_LOW_HZ,
} from "./voicemailTelephoneBand"

export const VOICEMAIL_AUDIO_BITS_PER_SECOND = 32_000
export const VOICEMAIL_HARD_STOP_MS = 120_000

export interface RecorderMime {
  /** Full MIME the MediaRecorder constructor needs, may include `;codecs=...`. */
  recorderMime: string
  /** Base MIME we send to the API, matching `VOICEMAIL_ALLOWED_CONTENT_TYPES`. */
  contentType: "audio/webm" | "audio/mp4" | "audio/ogg"
}

export interface VoicemailRecording {
  blob: Blob
  contentType: RecorderMime["contentType"]
  durationMs: number
  /** `URL.createObjectURL(blob)`. Caller must revoke when discarding. */
  objectUrl: string
  /** Whether the AudioWorklet path ran (true) or the BiquadFilter fallback did. */
  usedWorklet: boolean
}

export interface RecordingController {
  /**
   * Resolves to the processed recording once the MediaRecorder has fully
   * stopped. Fires either because the caller invoked requestStop() or
   * because the internal 2-minute hard-stop cut the take short. Rejects if
   * cancel() ran first or if the recorder errored.
   */
  finished: Promise<VoicemailRecording>
  /** Ask the recorder to stop. Safe to call multiple times. */
  requestStop: () => void
  /** Discard an in-flight take. Idempotent. */
  cancel: () => void
}

export function isMediaRecorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  )
}

/**
 * Pick the first MIME the browser can actually record. Order matches the
 * plan: Opus/WebM, then MP4, then Ogg. Returns `null` on an older browser
 * where none of the three are usable.
 */
export function pickRecorderMime(): RecorderMime | null {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return null
  }
  const candidates: RecorderMime[] = [
    { recorderMime: "audio/webm;codecs=opus", contentType: "audio/webm" },
    { recorderMime: "audio/webm", contentType: "audio/webm" },
    { recorderMime: "audio/mp4", contentType: "audio/mp4" },
    { recorderMime: "audio/ogg;codecs=opus", contentType: "audio/ogg" },
    { recorderMime: "audio/ogg", contentType: "audio/ogg" },
  ]
  for (const c of candidates) {
    try {
      if (window.MediaRecorder.isTypeSupported(c.recorderMime)) return c
    } catch {
      /* some browsers throw on unsupported, treat as not-supported */
    }
  }
  return null
}

interface ProcessorGraph {
  context: AudioContext
  destination: MediaStreamAudioDestinationNode
  usedWorklet: boolean
  dispose: () => void
}

/** Safari can hang forever on `resume` / `addModule` if the context stays suspended. */
const AUDIO_CONTEXT_RESUME_TIMEOUT_MS = 1_500
const WORKLET_LOAD_TIMEOUT_MS = 2_500

function createAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) {
    throw new Error("This browser has no AudioContext.")
  }
  return new Ctx()
}

async function resumeAudioContext(context: AudioContext): Promise<void> {
  if (context.state !== "suspended") return
  try {
    await Promise.race([
      context.resume(),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => {
          reject(
            new Error(
              `AudioContext.resume timed out after ${AUDIO_CONTEXT_RESUME_TIMEOUT_MS}ms (state=${context.state})`,
            ),
          )
        }, AUDIO_CONTEXT_RESUME_TIMEOUT_MS)
      }),
    ])
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[voicemail] AudioContext.resume failed", err)
  }
}

function connectBiquadTelephoneBand(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  destination: MediaStreamAudioDestinationNode,
): Array<{ disconnect: () => void }> {
  const makeBiquad = (type: BiquadFilterType, freq: number) => {
    const b = context.createBiquadFilter()
    b.type = type
    b.frequency.value = freq
    b.Q.value = BIQUAD_Q
    return b
  }
  const hp1 = makeBiquad("highpass", PHONE_LOW_HZ)
  const hp2 = makeBiquad("highpass", PHONE_LOW_HZ)
  const lp1 = makeBiquad("lowpass", PHONE_HIGH_HZ)
  const lp2 = makeBiquad("lowpass", PHONE_HIGH_HZ)
  source.connect(hp1).connect(hp2).connect(lp1).connect(lp2).connect(destination)
  return [hp1, hp2, lp1, lp2]
}

async function loadWorkletModule(context: AudioContext, workletUrl: string): Promise<void> {
  await Promise.race([
    context.audioWorklet.addModule(workletUrl),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`AudioWorklet addModule timed out after ${WORKLET_LOAD_TIMEOUT_MS}ms`))
      }, WORKLET_LOAD_TIMEOUT_MS)
    }),
  ])
}

async function buildProcessorGraph(
  stream: MediaStream,
  workletUrl: string,
): Promise<ProcessorGraph> {
  const context = createAudioContext()
  // Safari (and some Chromium builds) start suspended even after a click.
  // `audioWorklet.addModule` can hang indefinitely until the context runs.
  await resumeAudioContext(context)

  const source = context.createMediaStreamSource(stream)
  const destination = context.createMediaStreamDestination()
  // Prefer mono, but don't require it — Safari has thrown on explicit
  // channelCount for MediaStreamAudioDestinationNode.
  try {
    destination.channelCount = 1
    destination.channelCountMode = "explicit"
    destination.channelInterpretation = "discrete"
  } catch {
    /* leave browser defaults */
  }

  const trailing: Array<{ disconnect: () => void }> = []

  let usedWorklet = false
  try {
    await loadWorkletModule(context, workletUrl)
    const worklet = new AudioWorkletNode(context, "voicemail-telephone-band", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    source.connect(worklet).connect(destination)
    trailing.push(worklet)
    usedWorklet = true
  } catch (err) {
    // Band-only fallback: two high-passes and two low-passes at the same
    // corner frequencies, no companding grit. Also covers Safari hangs on
    // addModule (timeout above) and missing AudioWorklet support.
    // eslint-disable-next-line no-console
    console.warn("[voicemail] AudioWorklet unavailable; using BiquadFilter fallback", err)
    trailing.push(...connectBiquadTelephoneBand(context, source, destination))
  }

  const dispose = () => {
    try {
      source.disconnect()
    } catch {
      /* ignore */
    }
    for (const node of trailing) {
      try {
        node.disconnect()
      } catch {
        /* ignore */
      }
    }
    try {
      destination.disconnect()
    } catch {
      /* ignore */
    }
    void context.close().catch(() => {})
  }

  return { context, destination, usedWorklet, dispose }
}

export interface StartRecordingOptions {
  workletUrl: string
  mime: RecorderMime
  maxDurationMs?: number
  /** Fires when the hard-stop cut the take short. */
  onMaxDurationReached?: () => void
  /** Called when the stream ends unexpectedly (track ended, device lost). */
  onUnexpectedEnd?: (err: Error) => void
}

/** True Safari / iOS WebKit — not Chrome/Firefox/Edge on iOS or desktop. */
function isWebKitSafari(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return (
    /AppleWebKit/i.test(ua) &&
    !/Chrome|Chromium|CriOS|Edg|EdgiOS|OPiOS|FxiOS/i.test(ua)
  )
}

/**
 * Best-effort telephone graph. Never blocks start for long: Safari routinely
 * hangs on AudioContext.resume / audioWorklet.addModule, and a timed-out
 * getUserMedia retry (second concurrent call) can hang forever.
 */
async function tryProcessorGraph(
  stream: MediaStream,
  workletUrl: string,
  budgetMs: number,
): Promise<ProcessorGraph | null> {
  let settled = false
  const graphPromise = buildProcessorGraph(stream, workletUrl)
    .then((graph) => {
      if (settled) {
        graph.dispose()
        return null
      }
      return graph
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[voicemail] processor graph failed; recording raw mic", err)
      return null
    })

  const timedOut = new Promise<null>((resolve) => {
    window.setTimeout(() => {
      settled = true
      resolve(null)
    }, budgetMs)
  })

  return (await Promise.race([graphPromise, timedOut])) ?? null
}

function createRecorder(
  recordStream: MediaStream,
  mime: RecorderMime,
): MediaRecorder {
  const safari = isWebKitSafari()
  // Safari MediaRecorder is audio/mp4-only in practice; isTypeSupported can
  // lie about WebM and then start() misbehaves.
  const safariMime: RecorderMime = {
    recorderMime: "audio/mp4",
    contentType: "audio/mp4",
  }
  const effective = safari ? safariMime : mime
  try {
    return new MediaRecorder(recordStream, {
      mimeType: effective.recorderMime,
      ...(safari ? {} : { audioBitsPerSecond: VOICEMAIL_AUDIO_BITS_PER_SECOND }),
    })
  } catch {
    // Safari sometimes accepts isTypeSupported but rejects constructor options.
    return new MediaRecorder(recordStream)
  }
}

function startRecorder(recorder: MediaRecorder): void {
  // Safari has historically hung or ignored timeslice on start(timeslice).
  if (isWebKitSafari()) {
    recorder.start()
    return
  }
  recorder.start(250)
}

/**
 * Start recording. Returns a controller you can stop or cancel. The returned
 * promise resolves once getUserMedia is up (telephone processing is optional).
 */
export async function startVoicemailRecording(
  opts: StartRecordingOptions,
): Promise<RecordingController> {
  const {
    workletUrl,
    mime,
    maxDurationMs = VOICEMAIL_HARD_STOP_MS,
    onMaxDurationReached,
    onUnexpectedEnd,
  } = opts

  // One getUserMedia only. A timed-out first call + second concurrent call
  // deadlocks Safari's mic pipeline. Bare `{ audio: true }` is the most
  // reliable constraint set across Safari versions.
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

  // Safari: skip the live graph entirely — resume/addModule is what hung
  // "Starting microphone…". Other browsers get a short budget, then raw mic.
  let graph: ProcessorGraph | null = null
  if (!isWebKitSafari()) {
    try {
      graph = await tryProcessorGraph(stream, workletUrl, 2_000)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[voicemail] processor graph skipped", err)
      graph = null
    }
  } else {
    // eslint-disable-next-line no-console
    console.info("[voicemail] Safari: recording raw mic (no live telephone graph)")
  }

  const recordStream = graph?.destination.stream ?? stream
  let recorder: MediaRecorder
  try {
    recorder = createRecorder(recordStream, mime)
  } catch (err) {
    graph?.dispose()
    stream.getTracks().forEach((t) => t.stop())
    throw err
  }

  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now()

  const hardStop = window.setTimeout(() => {
    try {
      if (recorder.state === "recording") {
        onMaxDurationReached?.()
        recorder.stop()
      }
    } catch {
      /* ignore */
    }
  }, maxDurationMs)

  let settled = false
  let resolveFinal: ((rec: VoicemailRecording) => void) | null = null
  let rejectFinal: ((err: unknown) => void) | null = null

  const finalPromise = new Promise<VoicemailRecording>((resolve, reject) => {
    resolveFinal = resolve
    rejectFinal = reject
  })

  const teardown = () => {
    window.clearTimeout(hardStop)
    graph?.dispose()
    stream.getTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        /* ignore */
      }
    })
  }

  recorder.onstop = () => {
    if (settled) {
      teardown()
      return
    }
    settled = true
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now()
    const measured = Math.round(now - startedAt)
    const durationMs = Math.max(1, Math.min(maxDurationMs, measured))

    const finish = async () => {
      // Constructor fallbacks (Safari) may ignore our preferred MIME; prefer
      // whatever the recorder actually produced, then map to an API base type.
      const recordedType = (recorder.mimeType || mime.recorderMime)
        .split(";")[0]
        ?.trim()
        .toLowerCase()
      const contentType: RecorderMime["contentType"] =
        recordedType === "audio/mp4" ||
        recordedType === "audio/ogg" ||
        recordedType === "audio/webm"
          ? recordedType
          : mime.contentType

      let blob = new Blob(chunks, { type: contentType })
      if (contentType === "audio/webm") {
        try {
          // MediaRecorder WebM carries no Duration; `<audio>` and mpv seek
          // badly without it. fix-webm-duration appends a minimal metadata
          // section. (Cues would need ts-ebml + a Buffer polyfill; deferred
          // until the admin deck needs scrub precision beyond cluster seek.)
          blob = await fixWebmDuration(blob, durationMs, { logger: false })
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[voicemail] fixWebmDuration failed; uploading raw blob", err)
        }
      }
      teardown()
      const objectUrl = URL.createObjectURL(blob)
      resolveFinal!({
        blob,
        contentType,
        durationMs,
        objectUrl,
        usedWorklet: graph?.usedWorklet ?? false,
      })
    }

    void finish().catch((err) => {
      teardown()
      rejectFinal!(err)
    })
  }

  recorder.onerror = (ev) => {
    if (settled) return
    settled = true
    teardown()
    const err =
      (ev as unknown as { error?: Error }).error ??
      new Error("MediaRecorder error")
    rejectFinal!(err)
  }

  // If the underlying mic track ends out from under us, treat it as a hard
  // error so the UI can go back to idle rather than hang.
  for (const track of stream.getTracks()) {
    track.addEventListener("ended", () => {
      if (settled) return
      try {
        if (recorder.state === "recording") recorder.stop()
      } catch {
        /* ignore */
      }
      onUnexpectedEnd?.(new Error("Microphone stream ended"))
    })
  }

  // Modest timeslice so a hard-stopped take still flushes dataavailable
  // before onstop. Safari uses start() with no timeslice (see startRecorder).
  startRecorder(recorder)

  return {
    finished: finalPromise,
    requestStop() {
      if (recorder.state === "recording") {
        try {
          recorder.stop()
        } catch {
          /* ignore */
        }
      }
    },
    cancel() {
      if (settled) return
      settled = true
      try {
        if (recorder.state !== "inactive") recorder.stop()
      } catch {
          /* ignore */
      }
      teardown()
      rejectFinal!(new Error("Recording cancelled"))
      // Swallow the rejection so callers that ignore cancel() don't log a
      // spurious unhandled promise rejection.
      finalPromise.catch(() => {})
    },
  }
}

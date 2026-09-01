/*
 * Lock-screen probe worker. Disposable experiment — see README.md in this folder.
 *
 * Living at /sw-lock-probe/ means the default registration scope is /sw-lock-probe/,
 * so this worker can never intercept a request belonging to the real app.
 */

const SCOPE_PREFIX = "/sw-lock-probe/"
const PROBE_CACHE = "sw-lock-probe-v1"
const PROBE_KEY = SCOPE_PREFIX + "__record"

/** Distinguishes "worker was killed and restarted" from "worker ran the whole time". */
const BOOT_AT = Date.now()
const BOOT_ID = Math.random().toString(36).slice(2, 8)

/** A pause this long in the byte flow is what a suspended worker looks like. */
const GAP_THRESHOLD_MS = 3000
const PERSIST_INTERVAL_MS = 2000
const MAX_GAPS = 50

let record = null
let lastPersistAt = 0

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

async function persist() {
  if (!record) return
  const cache = await caches.open(PROBE_CACHE)
  await cache.put(
    PROBE_KEY,
    new Response(JSON.stringify(record), {
      headers: { "content-type": "application/json" },
    }),
  )
}

async function readPersisted() {
  const cache = await caches.open(PROBE_CACHE)
  const stored = await cache.match(PROBE_KEY)
  if (!stored) return null
  try {
    return await stored.json()
  } catch {
    return null
  }
}

async function handleProbe() {
  // In-memory wins while a stream is running; the cached copy survives worker restarts,
  // which is the whole point — if iOS kills the worker we still see when bytes stopped.
  const persisted = await readPersisted()
  const body = {
    now: Date.now(),
    bootAt: BOOT_AT,
    bootId: BOOT_ID,
    live: record,
    persisted,
  }
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
}

async function handleReset() {
  record = null
  lastPersistAt = 0
  const cache = await caches.open(PROBE_CACHE)
  await cache.delete(PROBE_KEY)
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  })
}

async function handleStream(request, url) {
  const upstream = url.searchParams.get("u")
  if (!upstream) return new Response("missing upstream url", { status: 400 })

  let upstreamUrl
  try {
    upstreamUrl = new URL(upstream)
  } catch {
    return new Response("unparseable upstream url", { status: 400 })
  }
  if (upstreamUrl.protocol !== "https:" && upstreamUrl.protocol !== "http:") {
    return new Response("upstream must be http(s)", { status: 400 })
  }

  // "passthrough" returns the fetched Response untouched. "tee" rebuilds the body from a
  // JS stream. Comparing the two separates "WebKit refuses service worker media" from
  // "WebKit refuses a JS-constructed body", which decides whether teeing is viable at all.
  const streamMode = url.searchParams.get("mode") === "passthrough" ? "passthrough" : "tee"

  const startedAt = Date.now()
  record = {
    startedAt,
    streamMode,
    bytes: 0,
    chunks: 0,
    lastChunkAt: startedAt,
    gaps: [],
    bootId: BOOT_ID,
    // WebKit probes media with a Range request. If the upstream ignores ranges, playback
    // can fail for reasons unrelated to the lock screen.
    sawRangeRequest: Boolean(request.headers.get("range")),
    rangeHeader: request.headers.get("range"),
    upstreamStatus: null,
    error: null,
  }
  lastPersistAt = startedAt
  await persist()

  let upstreamResponse
  try {
    upstreamResponse = await fetch(upstreamUrl.href, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    })
  } catch (error) {
    // Reading the body in a worker requires CORS; an opaque response has a null body.
    record.error = "upstream fetch failed (likely CORS): " + String(error)
    await persist()
    return new Response(record.error, { status: 502 })
  }

  record.upstreamStatus = upstreamResponse.status
  if (!upstreamResponse.ok || !upstreamResponse.body) {
    record.error = "upstream returned " + upstreamResponse.status
    await persist()
    return new Response(record.error, { status: 502 })
  }

  if (streamMode === "passthrough") {
    // Byte counters stay at zero here by design: nothing in JS touches the body.
    record.note = "pass-through, byte counters not available"
    await persist()
    return upstreamResponse
  }

  await persist()

  // Piping through a transform guarantees worker JS is actively pumping every byte,
  // which is the condition we are actually testing.
  const meter = new TransformStream({
    transform(chunk, controller) {
      const now = Date.now()
      const sinceLast = now - record.lastChunkAt
      if (sinceLast > GAP_THRESHOLD_MS && record.gaps.length < MAX_GAPS) {
        record.gaps.push({ at: now, ms: sinceLast, atBytes: record.bytes })
      }
      record.bytes += chunk.byteLength
      record.chunks += 1
      record.lastChunkAt = now
      if (now - lastPersistAt > PERSIST_INTERVAL_MS) {
        lastPersistAt = now
        persist()
      }
      controller.enqueue(chunk)
    },
    flush() {
      record.error = record.error || "upstream ended"
      persist()
    },
  })

  return new Response(upstreamResponse.body.pipeThrough(meter), {
    status: 200,
    headers: {
      "content-type": upstreamResponse.headers.get("content-type") || "audio/mpeg",
      "cache-control": "no-store",
    },
  })
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(SCOPE_PREFIX)) return

  if (url.pathname === SCOPE_PREFIX + "probe") {
    event.respondWith(handleProbe())
    return
  }
  if (url.pathname === SCOPE_PREFIX + "reset") {
    event.respondWith(handleReset())
    return
  }
  if (url.pathname === SCOPE_PREFIX + "stream") {
    event.respondWith(handleStream(event.request, url))
    return
  }
  // Anything else in scope (the page, this worker) goes straight to the network.
})

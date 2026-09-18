# Net-new patterns for the Redis OOM hardening plan

Execution reference for [`redis_oom_hardening_d65b916b.plan.md`](redis_oom_hardening_d65b916b.plan.md). Everything here has **no precedent in this repo** — these are the places where inventing your own shape will produce something subtly wrong. Follow these sketches; where an existing helper is named, use it instead of hand-rolling.

House style reminders from [AGENTS.md](../../AGENTS.md): strict TS, explicit types on public APIs, `@repo/` import aliases, camelCase files. `operations/data/*` wrap Redis in try/catch, log `"ERROR FROM data/<area>/<fn>"`, and return a typed failure rather than throwing. `services/*` throw typed errors.

---

## 1. Two-key rule (the invariant everything else protects)

Every piece of media has **two** keys and they are never the same value.

| | Lookup key | Object key |
| --- | --- | --- |
| Lives in | Redis pointer | S3 |
| Built from | whatever the API holds pre-RPC | something intrinsic to the media |
| May contain a Navidrome id | **yes** | **never** |
| If it is wrong | wasted RPC, self-heals | orphaned bytes, silent duplication |

**Hard rule: a Navidrome id (`song.id`, `albumId`, `coverArt`, playlist id) must never appear in an S3 key.** If you find yourself interpolating one into a `media/...` path, stop — you are reintroducing the bug the plan exists to fix.

---

## 2. Version tag in every key

Both key families carry a literal version segment:

```
media/previews/v1/{hash}.mp3
media/covers/v1/{hash}/{variant}.jpg
media:ptr:v1:preview:{hash}
```

**Why:** the object key is derived from a normalization function. The day someone changes how `title` is normalized, every old object becomes unreachable — which is survivable — but worse, a *pointer* written by the old code points at an object the new code would never produce, and you get a permanent silent miss. Bumping `v1` → `v2` makes that a clean cold start instead of a mystery.

Define the segment once, in the fingerprint module. Never inline the string.

---

## 3. Pure content-addressing module

New file: `packages/server/services/mediaFingerprint.ts`. **No I/O.** No Redis, no S3, no `AppContext`. This is the most testable and most load-bearing piece.

```ts
import { createHash } from "node:crypto"
import type { MetadataSourceTrack } from "@repo/types"

export const MEDIA_KEY_VERSION = "v1"

/** Lowercase, strip punctuation, collapse whitespace. Deterministic and order-free. */
function normalize(value: string | undefined | null): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/**
 * Stable identity for a track, independent of the Navidrome DB.
 * Returns null when there is not enough signal to key on — the caller must then
 * fall back to an id-keyed pointer with no S3 sharing.
 */
export function fingerprintTrack(track: MetadataSourceTrack): string | null {
  const artist = normalize(track.artists?.[0]?.title)
  const album = normalize(track.album?.title)
  const title = normalize(track.title)
  if (!title) return null
  if (!artist && !album) return null // placeholder-tagged file; too weak to key
  const durationSec = Math.round((track.duration ?? 0) / 1000)
  return sha256(
    [artist, album, title, track.discNumber ?? 0, track.trackNumber ?? 0, durationSec].join("|"),
  )
}
```

**Rules**

- `duration` on `MetadataSourceTrack` is **milliseconds** (see `mapSong` in [`local.ts`](../../apps/bridge-daemon/src/drivers/local.ts), which multiplies Navidrome seconds by 1000). Round to seconds or re-rips will split the key.
- Full sha256. Do **not** copy the 8-char md5 truncation from `albumArtworkImageId` — 32 bits collides around 77k objects, which is fine for a per-room image id and not fine for a global namespace.
- The `null` return is not an error path to swallow. It is a documented signal; the caller changes strategy.
- Cover identity is the *item's* identity, not the bytes: normalized playlist name for prefixed-playlist records, `artist|album` for album-derived. The cover **object** key is still `sha256(bytes)`.

**Test shape:** two differently-cased/punctuated inputs hash equal; a 1-second duration jitter hashes equal after rounding; empty artist + empty album returns `null`; the version segment appears in built keys.

---

## 4. Server-side S3 Head/Put

There is **no precedent for this in the repo.** `HeadObject` appears nowhere; [`s3Presign.ts`](../../packages/server/lib/s3Presign.ts) only signs PUTs for browsers. Reuse `getAssetS3Client()`; do not construct a second `S3Client`.

```ts
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getAssetS3Client } from "../lib/s3Presign"

/** True when the object already exists. Any non-404 error propagates. */
async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await getAssetS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (e: any) {
    // SDK v3 surfaces a missing object as NotFound / 404. Everything else — 403
    // from a missing s3:GetObject grant, throttling, network — is a real failure
    // and must NOT be treated as "regenerate it".
    if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) return false
    throw e
  }
}
```

**Rules**

- **Never collapse a 403 into a miss.** The IAM user is Put-only today ([`main.tf:265`](../../infra/cdn/main.tf)); if phase 6's `s3:GetObject` grant is missing, every Head returns 403, and a `catch → return false` would silently re-RPC and re-ffmpeg the entire catalog on every request. Let it throw and surface.
- `PutObject` sets `ContentType` and `CacheControl: "public, max-age=31536000, immutable"`. Content-addressed keys make this safe and it is most of the CDN win.
- **No ACL parameters.** The bucket is served through CloudFront OAC; public access is granted by the bucket policy in terraform, not per-object.
- **Do not add locking around Head-then-Put.** Two rooms racing write identical bytes to an identical key. The race is benign by construction; a lock would be new failure surface for nothing.
- Fail loudly if bucket or CDN env is missing — reuse the existing `getAssetBucket()` / `getAssetCdnBaseUrl()` from [`AssetUploadService.ts`](../../packages/server/services/AssetUploadService.ts). Extract them into a shared module rather than copying; do not re-read `process.env` in a new place.

---

## 5. Pointer records go through `SimpleCache`, not raw Redis

`context.cache` is already a Redis-backed [`SimpleCache`](../../packages/types/SimpleCache.ts) ([`redisSimpleCache.ts`](../../packages/server/lib/redisSimpleCache.ts)). Use it for every pointer.

Three reasons this matters more than it looks:

1. `set()` **always** applies `EX`, so a pointer can never be written without a TTL — which is exactly what `volatile-lru` needs.
2. `deleteByPrefix()` already exists and is how `refreshLocalLibrary` busts cover pointers.
3. It keeps pointer keys out of `operations/data/*`, so they never land inside the `room:{id}:*` prefix that `persistRoom` sweeps.

```ts
type CoverPointer = { url: string } | { none: true }

const COVER_TTL_SEC = 30 * 24 * 60 * 60
const COVER_NEGATIVE_TTL_SEC = 7 * 24 * 60 * 60

/** ±20% so a catalog written in one hydrate does not expire in one batch. */
function jitter(ttlSeconds: number): number {
  return Math.round(ttlSeconds * (0.8 + Math.random() * 0.4))
}
```

**Rules**

- **Cache misses, not just hits.** A record with no artwork gets `{ none: true }`. Without it, artless records re-RPC forever: `albumArtworkAttempted` ([`localLibrary/index.ts:94`](../../packages/plugin-item-shops/localLibrary/index.ts)) is in-memory, per-dyno, and cleared on every catalog refresh.
- **Sliding TTL = re-`set` on hit.** `SimpleCache` has no `expire`; refreshing means writing the same value back with a fresh jittered TTL. Do it on read-hit so active records never age out.
- **Always jitter.** Every TTL in this work, positive and negative.
- Values are JSON strings. Parse defensively — an unparseable pointer is a miss, not a crash.
- Pointer keys **must not** start with `room:`. See §6.

---

## 6. Cache keys are excluded from the room sweep

`persistRoom` ([`rooms.ts:573`](../../packages/server/operations/data/rooms.ts)) `PERSIST`s every key matching `room:{id}:*` and fires on admin join. Anything TTL'd that lands in that prefix becomes permanent and invisible to `volatile-lru`.

Two defenses, and phase 3 implements **both**:

1. Pointers live outside `room:` (`media:ptr:v1:...`).
2. `getAllRoomDataKeys`' persist/expire sweeps skip a declared cache-suffix list.

Declare the suffix list in one exported constant next to `getAllRoomDataKeys` so a future key addition has an obvious place to register. Test: `persistRoom` leaves a cache key's TTL intact while still persisting a room state key.

---

## 7. Redis value size guard

New shared helper, called by every blob-capable writer.

```ts
/** Refuse oversized values instead of letting them OOM a live show. */
export function assertRedisValueSize(label: string, value: string, maxBytes: number): void
```

**Rules**

- Measure `Buffer.byteLength(value, "utf8")`, not `value.length`.
- Refuse with a typed failure the caller already handles — `operations/data/*` return `{ success: false }`; do not throw into a socket handler.
- Log once with the label and the size, so the guard tripping is diagnosable.
- Ceiling is a named constant: **256KB** while blobs still exist, **8KB** after phases 9–11. Change it in one place.

---

## 8. RPC budget assertions

The plan's goal is "the DJ Mac does each piece of media work once, ever." That is only enforceable if tests assert on **call counts**, not just return values.

```ts
const fetchTrackPreview = vi.fn(/* ... */)
// ... warm the pointers, then simulate a reconnect ...
expect(fetchTrackPreview).not.toHaveBeenCalled()
```

Write these for: a bridge reconnect with warm cover pointers (**zero** cover RPCs); an artless record across two reconnects (**one** RPC); a simulated rescan — new Navidrome ids, same names/metadata — (**zero** RPCs for covers via pointer, **zero** ffmpeg for previews via S3 Head).

A test that only asserts the returned URL will pass while the Mac is being hammered. That is the regression this whole plan is trying to prevent.

---

## 9. Reuse, don't reinvent

| Need | Use this | Not this |
| --- | --- | --- |
| S3 client | `getAssetS3Client()` | a new `S3Client` |
| Bucket / CDN base URL | `getAssetBucket()` / `getAssetCdnBaseUrl()`, extracted to a shared module | fresh `process.env` reads |
| Pointer storage | `context.cache` (`SimpleCache`) | `context.redis.pubClient` directly |
| Bust a pointer family | `cache.deleteByPrefix()` | a hand-rolled `SCAN` |
| Stampede control | the in-flight map in [`trackPreviews.ts:92-115`](../../packages/server/operations/data/trackPreviews.ts) | a new mutex |
| Room image content hash | `hashRoomImageContent()` (already sha256) | a new hasher |
| Bulk delete in phase 12 | `UNLINK` | `DEL` (blocks the event loop) |

---

## 10. Order of work

`mediaFingerprint.ts` (§3) has no dependencies and everything else depends on it being right — build and test it first, in isolation. Then `MediaObjectCache` against mocked S3 (§4, §5). Only then touch a caller. Do not start with the migration phases; a wrong fingerprint discovered in phase 10 invalidates phase 9's stored URLs.

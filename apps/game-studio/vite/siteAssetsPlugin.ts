import { createHash } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"
import { rejectStudioRequest } from "./studioRequestGuard"

const ROUTE = "/__studio/assets"
const KEY_PREFIX = "assets/maps/sites/"
const MAX_INPUT_BYTES = 20 * 1024 * 1024
const MAX_MODEL_BYTES = 2 * 1024 * 1024
const IMAGE_MAX_EDGE = 1600
const IMAGE_QUALITY = 82
const GLB_MAGIC = 0x46546c67
const SETUP_HINT =
  "Uploads need AWS credentials with the map-designer policy: set AWS_PROFILE (e.g. in apps/game-studio/.env.local) and run `aws sso login`."

export type SiteAssetsOptions = {
  bucket: string
  cdnBaseUrl: string
  region: string
  /** Named AWS profile; falls back to the SDK's default chain. */
  profile?: string
}

type AssetKind = "image" | "model"

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > max) throw new HttpError(413, `Uploads are limited to ${max / 1024 / 1024} MB.`)
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/** Resize to fit, apply EXIF rotation, and re-encode as WebP (sharp drops metadata by default). */
async function processImage(input: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp")
  try {
    return await sharp(input)
      .rotate()
      .resize({
        width: IMAGE_MAX_EDGE,
        height: IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: IMAGE_QUALITY })
      .toBuffer()
  } catch {
    throw new HttpError(400, "That file isn't an image sharp can read (PNG, JPEG, WebP, AVIF, GIF).")
  }
}

/** GLB header: magic `glTF`, container version 2, declared length matching the file. */
function checkGlb(input: Buffer): Buffer {
  if (input.length > MAX_MODEL_BYTES) {
    throw new HttpError(413, "3D models are limited to 2 MB; decimate or compress the GLB.")
  }
  if (input.length < 12 || input.readUInt32LE(0) !== GLB_MAGIC) {
    throw new HttpError(400, "That file isn't a binary glTF (.glb).")
  }
  if (input.readUInt32LE(4) !== 2) {
    throw new HttpError(400, "Only glTF 2.0 models are supported.")
  }
  if (input.readUInt32LE(8) !== input.length) {
    throw new HttpError(400, "The GLB header length doesn't match the file; it may be truncated.")
  }
  return input
}

function isCredentialError(error: unknown): boolean {
  const name = (error as { name?: string }).name ?? ""
  return (
    name === "CredentialsProviderError" ||
    name === "ExpiredToken" ||
    name === "ExpiredTokenException" ||
    name === "InvalidAccessKeyId" ||
    name === "TokenProviderError" ||
    /credential|sso|token/i.test(String((error as Error).message ?? ""))
  )
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(body))
}

/**
 * Dev-only middleware that publishes Trip Map site art to the asset CDN with the
 * designer's own AWS credentials, so no keys ever reach the browser (ADR 0205).
 * Keys are content-addressed (`assets/maps/sites/<sha256>.<ext>`), so identical
 * bytes are a no-op and objects can be cached forever without invalidation.
 *
 * - `GET  /__studio/assets` → `{ configured, cdnBaseUrl, message? }`
 * - `POST /__studio/assets?kind=image|model` (raw body) → `{ url, key, bytes, reused }`
 */
export function siteAssetsPlugin(options: SiteAssetsOptions): Plugin {
  const cdnBase = options.cdnBaseUrl.replace(/\/+$/, "")
  let clientPromise: Promise<import("@aws-sdk/client-s3").S3Client> | null = null
  const client = () => {
    clientPromise ??= import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          region: options.region,
          ...(options.profile ? { profile: options.profile } : {}),
        }),
    )
    return clientPromise
  }

  const status = async () => {
    try {
      const s3 = await client()
      await s3.config.credentials()
      return { configured: true, cdnBaseUrl: cdnBase, bucket: options.bucket }
    } catch {
      return { configured: false, cdnBaseUrl: cdnBase, message: SETUP_HINT }
    }
  }

  const publish = async (kind: AssetKind, input: Buffer) => {
    const body = kind === "image" ? await processImage(input) : checkGlb(input)
    const ext = kind === "image" ? "webp" : "glb"
    const key = `${KEY_PREFIX}${createHash("sha256").update(body).digest("hex")}.${ext}`
    const url = `${cdnBase}/${key}`
    const { HeadObjectCommand, PutObjectCommand } = await import("@aws-sdk/client-s3")
    const s3 = await client()
    try {
      await s3.send(new HeadObjectCommand({ Bucket: options.bucket, Key: key }))
      return { url, key, bytes: body.length, reused: true }
    } catch (error) {
      // Without s3:ListBucket, S3 reports a missing key as 403; re-putting identical bytes is harmless.
      const code = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (code !== 404 && code !== 403) throw error
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: body,
        ContentType: kind === "image" ? "image/webp" : "model/gltf-binary",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    )
    return { url, key, bytes: body.length, reused: false }
  }

  return {
    name: "game-studio-site-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res) => {
        void (async () => {
          try {
            // Publishes to the production CDN with the designer's credentials: this machine only.
            const rejected = rejectStudioRequest(req)
            if (rejected) throw new HttpError(rejected.status, rejected.message)
            if (req.method === "GET") {
              sendJson(res, 200, await status())
              return
            }
            if (req.method !== "POST") {
              res.statusCode = 405
              res.end()
              return
            }
            const kind = new URL(req.url ?? "/", "http://studio").searchParams.get("kind")
            if (kind !== "image" && kind !== "model") {
              throw new HttpError(400, "kind must be image or model.")
            }
            const input = await readBody(req, MAX_INPUT_BYTES)
            if (input.length === 0) throw new HttpError(400, "The upload was empty.")
            sendJson(res, 200, await publish(kind, input))
          } catch (error) {
            if (error instanceof HttpError) {
              sendJson(res, error.status, { message: error.message })
            } else if (isCredentialError(error)) {
              sendJson(res, 503, { message: SETUP_HINT })
            } else if (/^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT)$/.test(
              String((error as NodeJS.ErrnoException).code),
            )) {
              sendJson(res, 502, {
                message: `Couldn't reach S3 (${(error as NodeJS.ErrnoException).code}); check your connection and try again.`,
              })
            } else if ((error as { name?: string }).name === "AccessDenied") {
              sendJson(res, 403, {
                message: `AWS denied the upload; your profile needs the map-designer policy on ${options.bucket}/${KEY_PREFIX}.`,
              })
            } else {
              sendJson(res, 500, { message: String((error as Error).message ?? error) })
            }
          }
        })()
      })
    },
  }
}

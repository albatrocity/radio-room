import { createHash } from "node:crypto"
import type { AppContext, MetadataSourceTrack, MetadataSourceUrl } from "@repo/types"
import { storeImage } from "../data"

function parseDataUri(dataUri: string): { mimeType: string; base64Data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUri)
  if (!match?.[1] || !match[2]) return null
  return { mimeType: match[1], base64Data: match[2] }
}

function isDataImageUrl(url: string): boolean {
  return url.startsWith("data:image")
}

function contentImageId(base64Data: string): string {
  const hash = createHash("md5").update(base64Data).digest("hex").slice(0, 12)
  return `qimg-${hash}`
}

async function rewriteImageUrl(params: {
  context: AppContext
  roomId: string
  image: MetadataSourceUrl
}): Promise<MetadataSourceUrl | null> {
  if (!isDataImageUrl(params.image.url)) return params.image
  const parsed = parseDataUri(params.image.url)
  if (!parsed) return null
  const apiUrl = params.context.apiUrl || ""
  try {
    const imageId = contentImageId(parsed.base64Data)
    const stored = await storeImage({
      roomId: params.roomId,
      imageId,
      base64Data: parsed.base64Data,
      mimeType: parsed.mimeType,
      context: params.context,
    })
    if (!stored.success) return null
    return {
      ...params.image,
      url: `${apiUrl}/api/rooms/${params.roomId}/images/${imageId}`,
    }
  } catch {
    return null
  }
}

async function rewriteImageList(params: {
  context: AppContext
  roomId: string
  images: MetadataSourceUrl[] | undefined
}): Promise<MetadataSourceUrl[]> {
  const images = params.images ?? []
  if (images.length === 0) return []
  const rewritten = await Promise.all(
    images.map((image) => rewriteImageUrl({ ...params, image })),
  )
  return rewritten.filter((image): image is MetadataSourceUrl => image != null)
}

/**
 * Re-host Local `data:` cover URIs onto the room image store before queue persist
 * so Redis blobs and QUEUE_CHANGED stay comparable to Spotify HTTPS thumbs.
 * Fail open: drop images that cannot be stored rather than blocking the queue.
 */
export async function rewriteLocalTrackImages(params: {
  context: AppContext
  roomId: string
  track: MetadataSourceTrack
}): Promise<MetadataSourceTrack> {
  const { context, roomId, track } = params
  const hasDataUri =
    track.images.some((image) => isDataImageUrl(image.url)) ||
    track.album.images.some((image) => isDataImageUrl(image.url))
  if (!hasDataUri) return track

  const [images, albumImages] = await Promise.all([
    rewriteImageList({ context, roomId, images: track.images }),
    rewriteImageList({ context, roomId, images: track.album.images }),
  ])
  return {
    ...track,
    images,
    album: {
      ...track.album,
      images: albumImages,
    },
  }
}

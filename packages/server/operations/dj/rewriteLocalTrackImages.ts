import type { AppContext, MetadataSourceTrack, MetadataSourceUrl } from "@repo/types"

function parseDataUri(dataUri: string): { mimeType: string; base64Data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUri)
  if (!match?.[1] || !match[2]) return null
  return { mimeType: match[1], base64Data: match[2] }
}

function isDataImageUrl(url: string): boolean {
  return url.startsWith("data:image")
}

async function rewriteImageUrl(params: {
  context: AppContext
  roomId: string
  image: MetadataSourceUrl
}): Promise<MetadataSourceUrl | null> {
  if (!isDataImageUrl(params.image.url)) return params.image
  const parsed = parseDataUri(params.image.url)
  if (!parsed) return null
  try {
    const { resolveMediaLibraryId } = await import("../bridge/bridgeDaemonId")
    const { hashCoverBytes } = await import("../../services/mediaFingerprint")
    const { ensureCoverObject } = await import("../../services/MediaObjectCache")
    const libraryId = await resolveMediaLibraryId({
      context: params.context,
      roomId: params.roomId,
    })
    const contentHash = hashCoverBytes(parsed.base64Data)
    const { url } = await ensureCoverObject({
      context: params.context,
      libraryId,
      identityHash: contentHash,
      variant: "sm",
      base64Data: parsed.base64Data,
      mimeType: parsed.mimeType,
    })
    return {
      ...params.image,
      url,
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
 * Re-host Local `data:` cover URIs onto content-addressed S3 (ADR 0186)
 * so queue items never carry Redis blobs. Fail open: drop images that cannot
 * be stored rather than blocking the queue.
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

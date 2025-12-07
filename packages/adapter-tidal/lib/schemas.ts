import { z } from "zod"
import { MetadataSourceTrack } from "@repo/types"

/**
 * Tidal API uses JSON:API format
 * Reference: https://tidal-music.github.io/tidal-api-reference/
 */

// =============================================================================
// Base JSON:API Schemas
// =============================================================================

export const tidalImageSchema = z.object({
  url: z.string(),
  width: z.number(),
  height: z.number(),
})

export const tidalResourceSchema = z.object({
  id: z.string(),
  type: z.string(),
})

// =============================================================================
// Artist Schema
// =============================================================================

export const tidalArtistAttributesSchema = z
  .object({
    name: z.string(),
    popularity: z.number().optional(),
    picture: z.array(tidalImageSchema).optional(),
  })
  .passthrough() // Allow additional fields

export const tidalArtistSchema = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    attributes: tidalArtistAttributesSchema,
  })
  .passthrough()

// =============================================================================
// Album Schema
// =============================================================================

export const tidalAlbumAttributesSchema = z
  .object({
    title: z.string(),
    releaseDate: z.string().optional(),
    numberOfTracks: z.number().optional(),
    // Copyright can be string or object with text field
    copyright: z.union([z.string(), z.object({ text: z.string() })]).optional(),
    imageCover: z.array(tidalImageSchema).optional(),
  })
  .passthrough() // Allow additional fields

export const tidalAlbumSchema = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    attributes: tidalAlbumAttributesSchema,
    relationships: z
      .object({
        artists: z
          .object({
            data: z.array(tidalResourceSchema),
          })
          .optional(),
        imageCover: z
          .object({
            data: z.array(tidalResourceSchema),
          })
          .optional(),
        coverArt: z
          .object({
            data: z.array(tidalResourceSchema),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

// =============================================================================
// Track Schema
// =============================================================================

export const tidalTrackAttributesSchema = z
  .object({
    title: z.string(),
    // Duration can be ISO 8601 format ("PT4M25S") or number
    duration: z.union([z.string(), z.number()]),
    explicit: z.boolean().optional(),
    popularity: z.number().optional(),
    trackNumber: z.number().optional(),
    volumeNumber: z.number().optional(), // Disc number
    isrc: z.string().optional(),
    // Copyright can be string or object with text field
    copyright: z.union([z.string(), z.object({ text: z.string() })]).optional(),
    version: z.string().nullish(),
    externalLinks: z
      .array(
        z.object({
          href: z.string(),
          meta: z.object({
            type: z.string(),
          }),
        }),
      )
      .optional(),
  })
  .passthrough() // Allow additional fields like accessType, availability, mediaTags

export const tidalTrackSchema = z
  .object({
    id: z.string(),
    type: z.string().optional(), // Type may not always be present
    attributes: tidalTrackAttributesSchema,
    relationships: z
      .object({
        artists: z
          .object({
            data: z.array(tidalResourceSchema),
          })
          .optional(),
        albums: z
          .object({
            data: z.array(tidalResourceSchema),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

// =============================================================================
// API Response Schemas
// =============================================================================

// More flexible schema for included items - they could be artists, albums, or other types
const tidalIncludedItemSchema = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    attributes: z.any().optional(),
    relationships: z.any().optional(),
  })
  .passthrough()

export const tidalSearchResponseSchema = z.object({
  data: z.array(tidalTrackSchema),
  included: z.array(tidalIncludedItemSchema).optional(),
})

export const tidalSingleTrackResponseSchema = z.object({
  data: tidalTrackSchema,
  included: z.array(z.union([tidalArtistSchema, tidalAlbumSchema])).optional(),
})

export const tidalTracksResponseSchema = z.object({
  data: z.array(tidalTrackSchema),
  included: z.array(tidalIncludedItemSchema).optional(),
})

// =============================================================================
// Token Response Schema
// =============================================================================

export const tidalTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number(),
})

// =============================================================================
// Transform Functions
// =============================================================================

type TidalTrack = z.infer<typeof tidalTrackSchema>
type TidalIncludedItem = z.infer<typeof tidalIncludedItemSchema>

/**
 * Parse ISO 8601 duration (PT4M25S) to milliseconds
 */
function parseIsoDuration(duration: string | number): number {
  if (typeof duration === "number") {
    return duration * 1000 // Assume seconds, convert to ms
  }

  // Parse ISO 8601 duration format like "PT4M25S"
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) {
    return 0
  }

  const hours = parseInt(match[1] || "0", 10)
  const minutes = parseInt(match[2] || "0", 10)
  const seconds = parseInt(match[3] || "0", 10)

  return (hours * 3600 + minutes * 60 + seconds) * 1000
}

/**
 * Transform Tidal API track to MetadataSourceTrack format
 */
export function transformTidalTrack(
  track: TidalTrack,
  included?: TidalIncludedItem[],
): MetadataSourceTrack {
  // Find related artists from included
  const artistIds = track.relationships?.artists?.data?.map((a: { id: string }) => a.id) ?? []
  const artistItems = (included ?? []).filter(
    (item) => item.type === "artists" && artistIds.includes(item.id),
  )
  const artists = artistItems.map((artist) => ({
    id: artist.id,
    title: String(artist.attributes?.name ?? "Unknown Artist"),
    urls: [
      {
        type: "resource" as const,
        url: `https://tidal.com/browse/artist/${artist.id}`,
        id: artist.id,
      },
    ],
  }))

  // Find related album from included
  const albumId = track.relationships?.albums?.data?.[0]?.id
  const albumData = (included ?? []).find((item) => item.type === "albums" && item.id === albumId)

  // Handle copyright - can be string or object
  const getCopyright = (copyright: unknown): string => {
    if (!copyright) return ""
    if (typeof copyright === "string") return copyright
    if (typeof copyright === "object" && copyright !== null && "text" in copyright) {
      return String((copyright as { text: string }).text ?? "")
    }
    return ""
  }

  // Helper to extract images from album data
  const getAlbumImages = (): MetadataSourceTrack["album"]["images"] => {
    // Check for imageCover array in attributes first (old format)
    if (Array.isArray(albumData?.attributes?.imageCover)) {
      return albumData.attributes.imageCover.map(
        (img: { url: string; width: number; height: number }) => ({
          type: "image" as const,
          url: img.url,
          id: `${img.width}x${img.height}`,
        }),
      )
    }

    // Check for coverArt or imageCover relationship and find images in included
    const imageCoverIds =
      albumData?.relationships?.coverArt?.data?.map((r: { id: string }) => r.id) ??
      albumData?.relationships?.imageCover?.data?.map((r: { id: string }) => r.id) ??
      []
    if (imageCoverIds.length > 0 && included) {
      const imageResources = included.filter(
        (item) =>
          (item.type === "imageResources" || item.type === "images" || item.type === "artworks") &&
          imageCoverIds.includes(item.id),
      )
      if (imageResources.length > 0) {
        console.log(`[Tidal Transform] Found ${imageResources.length} image resources for album`)

        // Check for direct url attribute
        const directImages = imageResources.filter((img) => img.attributes?.url)
        if (directImages.length > 0) {
          return directImages
            .map((img) => ({
              type: "image" as const,
              url: String(img.attributes?.url ?? ""),
              id: `${img.attributes?.width ?? 0}x${img.attributes?.height ?? 0}`,
            }))
            .filter((img) => img.url.length > 0)
        }

        // Check for files array (Tidal artwork format)
        // Files use { href: string, meta: { width: number, height: number } }
        const artworkWithFiles = imageResources.find((img) => Array.isArray(img.attributes?.files))
        if (artworkWithFiles?.attributes?.files) {
          const files = artworkWithFiles.attributes.files as Array<{
            href?: string
            url?: string
            meta?: { width?: number; height?: number }
            width?: number
            height?: number
          }>
          console.log(`[Tidal Transform] Found ${files.length} files in artwork`)
          const images = files
            .filter((file) => {
              const url = file.href ?? file.url
              return typeof url === "string" && url.length > 0
            })
            .map((file) => {
              const url = (file.href ?? file.url)!
              const width = file.meta?.width ?? file.width ?? 0
              const height = file.meta?.height ?? file.height ?? 0
              return {
                type: "image" as const,
                url,
                id: `${width}x${height}`,
              }
            })
          if (images.length > 0) {
            console.log(`[Tidal Transform] ✓ Extracted ${images.length} images from files`)
            return images
          }
        }

        // Fallback: construct URL from artwork ID using Tidal's resources pattern
        // Pattern: https://resources.tidal.com/images/{uuid-as-path}/{width}x{height}.jpg
        const artworkId = imageResources[0]?.id
        if (artworkId) {
          console.log(`[Tidal Transform] Constructing URLs from artwork ID: ${artworkId}`)
          const imagePath = artworkId.replace(/-/g, "/")
          return [
            {
              type: "image" as const,
              url: `https://resources.tidal.com/images/${imagePath}/640x640.jpg`,
              id: "640x640",
            },
            {
              type: "image" as const,
              url: `https://resources.tidal.com/images/${imagePath}/320x320.jpg`,
              id: "320x320",
            },
            {
              type: "image" as const,
              url: `https://resources.tidal.com/images/${imagePath}/160x160.jpg`,
              id: "160x160",
            },
          ]
        }
      }
    }

    // Check for tidalImageId or similar - construct URL
    // Tidal uses pattern: https://resources.tidal.com/images/{uuid}/{width}x{height}.jpg
    const imageId = albumData?.attributes?.imageId ?? albumData?.attributes?.cover
    if (typeof imageId === "string" && imageId.length > 0) {
      // Replace dashes with slashes in UUID for Tidal's image path format
      const imagePath = imageId.replace(/-/g, "/")
      return [
        {
          type: "image" as const,
          url: `https://resources.tidal.com/images/${imagePath}/640x640.jpg`,
          id: "640x640",
        },
        {
          type: "image" as const,
          url: `https://resources.tidal.com/images/${imagePath}/320x320.jpg`,
          id: "320x320",
        },
        {
          type: "image" as const,
          url: `https://resources.tidal.com/images/${imagePath}/160x160.jpg`,
          id: "160x160",
        },
      ]
    }

    return []
  }

  const album: MetadataSourceTrack["album"] = albumData
    ? {
        id: albumData.id,
        title: String(albumData.attributes?.title ?? ""),
        urls: [
          {
            type: "resource" as const,
            url: `https://tidal.com/browse/album/${albumData.id}`,
            id: albumData.id,
          },
        ],
        artists: [], // Album artists would need additional lookup
        releaseDate: String(albumData.attributes?.releaseDate ?? ""),
        releaseDatePrecision: "day" as const,
        totalTracks: Number(albumData.attributes?.numberOfTracks ?? 0),
        label: getCopyright(albumData.attributes?.copyright),
        images: getAlbumImages(),
      }
    : {
        id: "unknown",
        title: "",
        urls: [],
        artists: [],
        releaseDate: "",
        releaseDatePrecision: "year" as const,
        totalTracks: 0,
        label: "",
        images: [],
      }

  // Get track images from album
  const images = album.images

  // Get external link URL if available
  const externalUrl =
    track.attributes.externalLinks?.find((link) => link.meta.type === "TIDAL_SHARING")?.href ??
    `https://tidal.com/browse/track/${track.id}`

  return {
    id: track.id,
    title: track.attributes.title,
    urls: [
      {
        type: "resource" as const,
        url: externalUrl,
        id: track.id,
      },
    ],
    artists,
    album,
    duration: parseIsoDuration(track.attributes.duration),
    explicit: track.attributes.explicit ?? false,
    trackNumber: track.attributes.trackNumber ?? 0,
    discNumber: track.attributes.volumeNumber ?? 1,
    popularity: Math.round((track.attributes.popularity ?? 0) * 100), // Convert 0-1 to 0-100
    images,
  }
}

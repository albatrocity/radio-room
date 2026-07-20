import type {
  MetadataSourceAdapter,
  MetadataSourceAdapterConfig,
  MetadataSourceApi,
  MetadataSourceSearchParameters,
  MetadataSourceTrack,
} from "@repo/types"
import { emptyAlbum, emptyArtist } from "./trackHelpers"

function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const h = Number(match[1] ?? 0)
  const m = Number(match[2] ?? 0)
  const s = Number(match[3] ?? 0)
  return ((h * 3600 + m * 60 + s) * 1000) | 0
}

function mapSearchItem(item: {
  id: { videoId?: string }
  snippet?: {
    title?: string
    channelId?: string
    channelTitle?: string
    thumbnails?: Record<string, { url?: string }>
  }
}): MetadataSourceTrack | null {
  const videoId = item.id?.videoId
  if (!videoId) return null
  const title = item.snippet?.title ?? "Untitled"
  const channelId = item.snippet?.channelId ?? ""
  const channelTitle = item.snippet?.channelTitle ?? "YouTube"
  const thumbs = item.snippet?.thumbnails ?? {}
  const thumbUrl =
    thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

  return {
    id: videoId,
    title,
    urls: [
      {
        type: "resource",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        id: videoId,
      },
    ],
    artists: [emptyArtist(channelId, channelTitle)],
    album: emptyAlbum({
      images: [{ type: "image", url: thumbUrl, id: videoId }],
    }),
    duration: 0,
    explicit: false,
    trackNumber: 0,
    discNumber: 0,
    popularity: 0,
    images: [{ type: "image", url: thumbUrl, id: videoId }],
  }
}

async function youtubeGetJson(pathAndQuery: string, apiKey: string): Promise<any> {
  const url = `https://www.googleapis.com/youtube/v3/${pathAndQuery}${
    pathAndQuery.includes("?") ? "&" : "?"
  }key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`YouTube API ${res.status}: ${text}`)
  }
  return res.json()
}

export function createYoutubeMetadataApi(apiKey: string): MetadataSourceApi {
  return {
    async search(query: string) {
      if (!query.trim()) return []
      if (!apiKey) {
        console.warn("[youtube-metadata] search skipped — YOUTUBE_API_KEY not set")
        return []
      }
      console.log(`[YouTube Search] Searching for: "${query}"`)
      try {
        const data = await youtubeGetJson(
          `search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}`,
          apiKey,
        )
        const items = (data.items ?? [])
          .map(mapSearchItem)
          .filter(Boolean) as MetadataSourceTrack[]

        const ids = items.map((t) => t.id).join(",")
        if (!ids) {
          console.log(`[YouTube Search] ✗ No results for: "${query}"`)
          return items
        }

        try {
          const details = await youtubeGetJson(
            `videos?part=contentDetails,status&id=${ids}`,
            apiKey,
          )
          const byId = new Map<string, any>()
          for (const v of details.items ?? []) {
            byId.set(v.id, v)
          }
          const mapped = items
            .filter((t) => {
              const d = byId.get(t.id)
              if (!d) return true
              // Drop non-embeddable when status present
              if (d.status?.embeddable === false) return false
              return true
            })
            .map((t) => {
              const d = byId.get(t.id)
              const duration = d?.contentDetails?.duration
                ? parseIsoDuration(d.contentDetails.duration)
                : t.duration
              return { ...t, duration }
            })
          console.log(`[YouTube Search] ✓ Found ${mapped.length} videos for: "${query}"`)
          return mapped
        } catch (e) {
          console.warn("[youtube-metadata] videos.list failed, returning search-only:", e)
          return items
        }
      } catch (e) {
        console.error(`[YouTube Search] ✗ Failed for "${query}":`, (e as Error).message)
        throw e
      }
    },

    async searchByParams(params: MetadataSourceSearchParameters) {
      const artist = params.artists?.[0]?.title ?? ""
      const q = [params.title, artist].filter(Boolean).join(" ")
      return this.search(q)
    },

    async findById(id: string) {
      const details = await youtubeGetJson(
        `videos?part=snippet,contentDetails,status&id=${encodeURIComponent(id)}`,
        apiKey,
      )
      const v = details.items?.[0]
      if (!v) return null
      const mapped = mapSearchItem({
        id: { videoId: v.id },
        snippet: v.snippet,
      })
      if (!mapped) return null
      if (v.status?.embeddable === false) return null
      return {
        ...mapped,
        duration: v.contentDetails?.duration
          ? parseIsoDuration(v.contentDetails.duration)
          : 0,
      }
    },
  }
}

export const youtubeMetadataSource: MetadataSourceAdapter = {
  register: async (config: MetadataSourceAdapterConfig) => {
    const apiKey = process.env.YOUTUBE_API_KEY ?? ""
    if (!apiKey) {
      console.warn(
        "[youtube-metadata] YOUTUBE_API_KEY not set; YouTube search will fail until configured",
      )
    }
    const api = createYoutubeMetadataApi(apiKey)
    await config.onRegistered?.({ name: config.name })
    return {
      name: config.name,
      authentication: config.authentication,
      api,
    }
  },
}

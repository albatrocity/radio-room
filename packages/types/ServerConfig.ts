import { PlaybackControllerAdapterConfig } from "./PlaybackController"
import { SimpleCache } from "./SimpleCache"

export interface CreateServerConfig {
  playbackControllers?: Array<PlaybackControllerAdapterConfig>
  cacheImplementation?: SimpleCache
  onStart?: () => void
  PORT?: number
  REDIS_URL?: string
  ENVIRONMENT?: "production" | "development"
  DOMAIN?: string
  /** Base URL for the API (e.g., "https://api.example.com"). Used for generating absolute URLs. */
  API_URL?: string
  /** Handler mounted before express.json() for platform auth (e.g., Better-Auth's toNodeHandler) */
  platformAuthHandler?: {
    path: string
    handler: (req: any, res: any) => any
  }
  /** Middleware to protect admin-only routes (e.g., requireAdmin from @repo/auth) */
  requireAdmin?: (req: any, res: any, next: any) => any
}

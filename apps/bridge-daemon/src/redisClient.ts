import { createClient, type RedisClientType } from "redis"

export type BridgeRedisClient = ReturnType<typeof createClient>

/**
 * Parse Redis URL and detect the same `/#insecure` convention as local-remote
 * (redis-rs `tls-rustls-insecure`). Node's `redis` package does not honor that
 * fragment; we strip it and set `rejectUnauthorized: false`.
 */
export function parseRedisUrl(redisUrl: string): { url: string; insecureTls: boolean } {
  let url = redisUrl.trim()
  const insecureTls = /#insecure\b/i.test(url)
  if (insecureTls) {
    url = url.replace(/\/?#insecure\b/i, "")
  }
  return { url, insecureTls }
}

/** Create a redis client; honors `rediss://…/#insecure` for self-signed prod certs. */
export function createBridgeRedisClient(redisUrl: string): BridgeRedisClient {
  const { url, insecureTls } = parseRedisUrl(redisUrl)
  return createClient({
    url,
    socket: insecureTls
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
  })
}

export type RedisLike = RedisClientType<any, any, any>

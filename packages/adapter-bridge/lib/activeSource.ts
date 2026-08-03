import type { RedisClientType } from "redis"

type RedisLike = RedisClientType<any, any, any>

const ACTIVE_SOURCE_KEY = (roomId: string) => `room:${roomId}:bridge:active_source`
const LAST_VOLUME_KEY = (roomId: string) => `room:${roomId}:bridge:last_volume`

export class ActiveSourceStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly roomId: string,
  ) {}

  async get(): Promise<string | null> {
    return this.redis.get(ACTIVE_SOURCE_KEY(this.roomId))
  }

  async set(source: string): Promise<void> {
    await this.redis.set(ACTIVE_SOURCE_KEY(this.roomId), source)
  }

  async clear(): Promise<void> {
    await this.redis.del(ACTIVE_SOURCE_KEY(this.roomId))
  }

  async getLastVolume(): Promise<number | null> {
    const raw = await this.redis.get(LAST_VOLUME_KEY(this.roomId))
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  async setLastVolume(percent: number): Promise<void> {
    await this.redis.set(LAST_VOLUME_KEY(this.roomId), String(Math.max(0, Math.min(100, percent))))
  }
}

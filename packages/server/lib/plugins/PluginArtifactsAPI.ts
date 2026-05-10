import { randomUUID } from "node:crypto"
import type {
  AppContext,
  ArtifactRetrieveAttempt,
  ArtifactsPluginAPI,
  StoredArtifact,
  StoredArtifactPublic,
} from "@repo/types"

const REDIS_KEY = "global:storedArtifacts"

/**
 * Global (cross-room) artifact storage backed by a single Redis hash.
 */
export class PluginArtifactsAPI implements ArtifactsPluginAPI {
  constructor(private readonly context: AppContext) {}

  async store(artifact: Omit<StoredArtifact, "id">): Promise<string> {
    const id = randomUUID()
    const full: StoredArtifact = { id, ...artifact }
    await this.context.redis.pubClient.hSet(REDIS_KEY, id, JSON.stringify(full))
    return id
  }

  async getAll(): Promise<StoredArtifactPublic[]> {
    const all = await this.context.redis.pubClient.hGetAll(REDIS_KEY)
    return Object.values(all).map((raw) => {
      try {
        const { password: _p, ...pub } = JSON.parse(raw) as StoredArtifact
        return pub
      } catch {
        return null
      }
    }).filter((x): x is StoredArtifactPublic => x != null)
  }

  async attemptRetrieve(id: string, password: string): Promise<ArtifactRetrieveAttempt> {
    const raw = await this.context.redis.pubClient.hGet(REDIS_KEY, id)
    if (raw == null) {
      return { status: "not_found" }
    }
    let artifact: StoredArtifact
    try {
      artifact = JSON.parse(raw) as StoredArtifact
    } catch {
      return { status: "not_found" }
    }
    if (artifact.password !== password) {
      return { status: "wrong_password" }
    }
    return { status: "success", artifact }
  }

  async remove(id: string): Promise<boolean> {
    const deleted = await this.context.redis.pubClient.hDel(REDIS_KEY, id)
    return deleted > 0
  }
}

import { randomUUID } from "node:crypto"
import type {
  AppContext,
  ArtifactContentInput,
  ArtifactRetrieveAttempt,
  ArtifactUpdatePatch,
  ArtifactsPluginAPI,
  StoredArtifact,
  StoredArtifactPublic,
} from "@repo/types"
import {
  applyArtifactStoreWrite,
  applyArtifactUpdateWrite,
  toStoredArtifactListing,
} from "@repo/game-logic"
import generateId from "../generateId"

const REDIS_KEY = "global:storedArtifacts"
const ARTIFACT_LOCK_TTL_SEC = 10
const ARTIFACT_LOCK_RETRY_MS = 25
const ARTIFACT_LOCK_MAX_ATTEMPTS = 40

function artifactLockKey(id: string): string {
  return `${REDIS_KEY}:lock:${id}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Global (cross-room) artifact storage backed by a single Redis hash.
 */
export class PluginArtifactsAPI implements ArtifactsPluginAPI {
  constructor(private readonly context: AppContext) {}

  async store(
    artifact: Omit<StoredArtifact, "id" | "contents"> & { contents?: ArtifactContentInput[] },
  ): Promise<string> {
    const id = randomUUID()
    const full = applyArtifactStoreWrite(
      { id, ...artifact } as StoredArtifact,
      () => randomUUID(),
      Date.now(),
    )
    await this.context.redis.pubClient.hSet(REDIS_KEY, id, JSON.stringify(full))
    return id
  }

  async getAll(): Promise<StoredArtifactPublic[]> {
    const all = await this.context.redis.pubClient.hGetAll(REDIS_KEY)
    return Object.values(all)
      .map((raw) => {
        try {
          return toStoredArtifactListing(JSON.parse(raw) as StoredArtifact)
        } catch {
          return null
        }
      })
      .filter((x): x is StoredArtifactPublic => x != null)
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

  async update(id: string, patch: ArtifactUpdatePatch): Promise<StoredArtifact | null> {
    const raw = await this.context.redis.pubClient.hGet(REDIS_KEY, id)
    if (raw == null) return null
    let artifact: StoredArtifact
    try {
      artifact = JSON.parse(raw) as StoredArtifact
    } catch {
      return null
    }

    const next = applyArtifactUpdateWrite(artifact, patch, () => randomUUID(), Date.now())
    await this.context.redis.pubClient.hSet(REDIS_KEY, id, JSON.stringify(next))
    return next
  }

  async withArtifactLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const key = artifactLockKey(id)
    const token = generateId()
    let acquired = false
    try {
      for (let attempt = 0; attempt < ARTIFACT_LOCK_MAX_ATTEMPTS; attempt++) {
        const result = await this.context.redis.pubClient.set(key, token, {
          NX: true,
          EX: ARTIFACT_LOCK_TTL_SEC,
        })
        if (result === "OK") {
          acquired = true
          break
        }
        await sleep(ARTIFACT_LOCK_RETRY_MS)
      }
      if (!acquired) {
        throw new Error(`[PluginArtifactsAPI] could not acquire artifact lock for ${id}`)
      }
      return await fn()
    } finally {
      if (acquired) {
        const current = await this.context.redis.pubClient.get(key)
        if (current === token) {
          await this.context.redis.pubClient.del(key)
        }
      }
    }
  }
}

import { randomUUID } from "node:crypto"
import type {
  AppContext,
  ArtifactAccessGrant,
  ArtifactContentInput,
  ArtifactGrantRetrieveAttempt,
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
  STASH_ACCESS_GRANT_TTL_MS,
  buildArtifactAccessGrant,
  readLiveAccessGrant,
} from "@repo/game-logic"
import generateId from "../generateId"

const REDIS_KEY = "global:storedArtifacts"
const ACCESS_KEY_PREFIX = `${REDIS_KEY}:access:`
const ARTIFACT_LOCK_TTL_SEC = 10
const ARTIFACT_LOCK_RETRY_MS = 25
const ARTIFACT_LOCK_MAX_ATTEMPTS = 40

function artifactLockKey(id: string): string {
  return `${REDIS_KEY}:lock:${id}`
}

function accessKey(userId: string): string {
  return `${ACCESS_KEY_PREFIX}${userId}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Global (cross-room) artifact storage backed by a single Redis hash.
 */
export class PluginArtifactsAPI implements ArtifactsPluginAPI {
  constructor(private readonly context: AppContext) {}

  private async readRow(id: string): Promise<StoredArtifact | null> {
    const raw = await this.context.redis.pubClient.hGet(REDIS_KEY, id)
    if (raw == null) return null
    try {
      return JSON.parse(raw) as StoredArtifact
    } catch {
      return null
    }
  }

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

  async getPublic(id: string): Promise<StoredArtifactPublic | null> {
    const artifact = await this.readRow(id)
    if (!artifact) return null
    return toStoredArtifactListing(artifact)
  }

  async attemptRetrieve(id: string, password: string): Promise<ArtifactRetrieveAttempt> {
    const artifact = await this.readRow(id)
    if (!artifact) {
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
    const artifact = await this.readRow(id)
    if (!artifact) return null

    const next = applyArtifactUpdateWrite(artifact, patch, () => randomUUID(), Date.now())
    await this.context.redis.pubClient.hSet(REDIS_KEY, id, JSON.stringify(next))
    return next
  }

  async grantAccess(params: {
    artifactId: string
    userId: string
    source: string
    roomId?: string
    ttlMs?: number
  }): Promise<ArtifactAccessGrant | null> {
    const artifact = await this.readRow(params.artifactId)
    if (!artifact) return null

    const now = Date.now()
    const ttlMs = params.ttlMs ?? STASH_ACCESS_GRANT_TTL_MS
    const grant = buildArtifactAccessGrant({
      artifactId: params.artifactId,
      userId: params.userId,
      source: params.source,
      roomId: params.roomId,
      ttlMs,
      now,
    })

    const key = accessKey(params.userId)
    await this.context.redis.pubClient.hSet(key, params.artifactId, JSON.stringify(grant))
    await this.context.redis.pubClient.expire(key, Math.ceil(ttlMs / 1000))
    return grant
  }

  async listAccessGrants(userId: string, now: number = Date.now()): Promise<ArtifactAccessGrant[]> {
    const key = accessKey(userId)
    const all = await this.context.redis.pubClient.hGetAll(key)
    const grants: ArtifactAccessGrant[] = []
    for (const [artifactId, raw] of Object.entries(all)) {
      const grant = readLiveAccessGrant(raw, now)
      if (grant) {
        grants.push(grant)
      } else if (raw) {
        try {
          JSON.parse(raw)
        } catch {
          await this.context.redis.pubClient.hDel(key, artifactId)
        }
      }
    }
    return grants
  }

  private async readGrant(
    artifactId: string,
    userId: string,
    now: number = Date.now(),
  ): Promise<ArtifactAccessGrant | null> {
    const key = accessKey(userId)
    const raw = await this.context.redis.pubClient.hGet(key, artifactId)
    if (raw == null) return null
    return readLiveAccessGrant(raw, now)
  }

  async attemptRetrieveWithGrant(
    id: string,
    userId: string,
  ): Promise<ArtifactGrantRetrieveAttempt> {
    const grant = await this.readGrant(id, userId)
    if (!grant) {
      return { status: "no_grant" }
    }
    const artifact = await this.readRow(id)
    if (!artifact) {
      return { status: "not_found" }
    }
    return { status: "success", artifact }
  }

  async revokeAccessGrant(artifactId: string, userId: string): Promise<boolean> {
    const key = accessKey(userId)
    const deleted = await this.context.redis.pubClient.hDel(key, artifactId)
    return deleted > 0
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

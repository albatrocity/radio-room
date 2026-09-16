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
  normalizeArtifactPayload,
  readArtifactContents,
  sanitizeStashLabel,
  sanitizeStashNote,
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

function applyNormalized(
  artifact: StoredArtifact,
  contents = readArtifactContents(artifact),
): StoredArtifact {
  const normalized = normalizeArtifactPayload(contents, () => randomUUID())
  const next: StoredArtifact = { ...artifact, ...normalized }
  if (normalized.coinValue === undefined) delete next.coinValue
  if (normalized.itemDefinitionId === undefined) delete next.itemDefinitionId
  if (normalized.itemName === undefined) delete next.itemName
  if (normalized.itemQuantity === undefined) delete next.itemQuantity
  return next
}

function applyPublicText(
  artifact: StoredArtifact,
  label: unknown,
  note: unknown,
  mode: "replace" | "if-present",
): StoredArtifact {
  const next = { ...artifact }
  if (mode === "replace" || label !== undefined) {
    const result = sanitizeStashLabel(label)
    if (result.status === "too_long") {
      throw new Error("Stash name must be 32 characters or fewer.")
    }
    if (result.status === "ok") next.label = result.value
    else delete next.label
  }
  if (mode === "replace" || note !== undefined) {
    const result = sanitizeStashNote(note)
    if (result.status === "too_long") {
      throw new Error("Stash note must be 140 characters or fewer.")
    }
    if (result.status === "ok") next.note = result.value
    else delete next.note
  }
  return next
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
    let full: StoredArtifact = { id, ...artifact }
    full = applyNormalized(full)
    full = applyPublicText(full, artifact.label, artifact.note, "replace")
    await this.context.redis.pubClient.hSet(REDIS_KEY, id, JSON.stringify(full))
    return id
  }

  async getAll(): Promise<StoredArtifactPublic[]> {
    const all = await this.context.redis.pubClient.hGetAll(REDIS_KEY)
    return Object.values(all)
      .map((raw) => {
        try {
          const { password: _p, ...pub } = JSON.parse(raw) as StoredArtifact
          return pub
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

    const contents =
      patch.contents !== undefined ? patch.contents : readArtifactContents(artifact)
    let next = applyNormalized({ ...artifact, contents: undefined }, contents)
    if (patch.containerDefinitionId !== undefined) {
      if (patch.containerDefinitionId == null || patch.containerDefinitionId === "") {
        delete next.containerDefinitionId
      } else {
        next.containerDefinitionId = patch.containerDefinitionId
      }
    }
    if ("label" in patch) {
      next = applyPublicText(next, patch.label, undefined, "if-present")
    }
    if ("note" in patch) {
      next = applyPublicText(next, undefined, patch.note, "if-present")
    }

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

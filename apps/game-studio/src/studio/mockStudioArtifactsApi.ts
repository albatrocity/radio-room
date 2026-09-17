import type {
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
  isLiveAccessGrant,
} from "@repo/game-logic"
import type { StudioRoom } from "./studioRoom"

export class MockStudioArtifactsApi implements ArtifactsPluginAPI {
  private readonly accessGrants = new Map<string, Map<string, ArtifactAccessGrant>>()

  constructor(private readonly room: StudioRoom) {}

  private grantsForUser(userId: string): Map<string, ArtifactAccessGrant> {
    let map = this.accessGrants.get(userId)
    if (!map) {
      map = new Map()
      this.accessGrants.set(userId, map)
    }
    return map
  }

  private readGrant(artifactId: string, userId: string, now: number = Date.now()) {
    const grant = this.grantsForUser(userId).get(artifactId)
    return isLiveAccessGrant(grant, now) ? grant : null
  }

  async store(
    artifact: Omit<StoredArtifact, "id" | "contents"> & { contents?: ArtifactContentInput[] },
  ): Promise<string> {
    const id = crypto.randomUUID()
    const full = applyArtifactStoreWrite(
      { ...artifact, id } as StoredArtifact,
      () => crypto.randomUUID(),
      Date.now(),
    )
    this.room.addStoredArtifact(full)
    return id
  }

  async getAll(): Promise<StoredArtifactPublic[]> {
    return this.room.storedArtifacts.map(toStoredArtifactListing)
  }

  async getPublic(id: string): Promise<StoredArtifactPublic | null> {
    const artifact = this.room.storedArtifacts.find((a) => a.id === id)
    if (!artifact) return null
    return toStoredArtifactListing(artifact)
  }

  async attemptRetrieve(id: string, password: string): Promise<ArtifactRetrieveAttempt> {
    const artifact = this.room.storedArtifacts.find((a) => a.id === id)
    if (!artifact) return { status: "not_found" }
    if (artifact.password !== password) return { status: "wrong_password" }
    return { status: "success", artifact }
  }

  async remove(id: string): Promise<boolean> {
    return this.room.removeStoredArtifact(id)
  }

  async update(id: string, patch: ArtifactUpdatePatch): Promise<StoredArtifact | null> {
    const artifact = this.room.storedArtifacts.find((a) => a.id === id)
    if (!artifact) return null
    const next = applyArtifactUpdateWrite(artifact, patch, () => crypto.randomUUID(), Date.now())
    this.room.updateStoredArtifact(next)
    return next
  }

  async grantAccess(params: {
    artifactId: string
    userId: string
    source: string
    roomId?: string
    ttlMs?: number
  }): Promise<ArtifactAccessGrant | null> {
    const artifact = this.room.storedArtifacts.find((a) => a.id === params.artifactId)
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
    this.grantsForUser(params.userId).set(params.artifactId, grant)
    return grant
  }

  async listAccessGrants(userId: string, now: number = Date.now()): Promise<ArtifactAccessGrant[]> {
    const map = this.grantsForUser(userId)
    const grants: ArtifactAccessGrant[] = []
    for (const [artifactId, grant] of map) {
      if (isLiveAccessGrant(grant, now)) {
        grants.push(grant)
      } else {
        map.delete(artifactId)
      }
    }
    return grants
  }

  async attemptRetrieveWithGrant(
    id: string,
    userId: string,
  ): Promise<ArtifactGrantRetrieveAttempt> {
    const grant = this.readGrant(id, userId)
    if (!grant) return { status: "no_grant" }
    const artifact = this.room.storedArtifacts.find((a) => a.id === id)
    if (!artifact) return { status: "not_found" }
    return { status: "success", artifact }
  }

  async revokeAccessGrant(artifactId: string, userId: string): Promise<boolean> {
    return this.grantsForUser(userId).delete(artifactId)
  }

  /** Dev-only: backdate lastTouchedAt on a mock row (ADR 0182 pt 3). */
  backdateLastTouchedAt(id: string, lastTouchedAt: number): boolean {
    const artifact = this.room.storedArtifacts.find((a) => a.id === id)
    if (!artifact) return false
    this.room.updateStoredArtifact({ ...artifact, lastTouchedAt })
    return true
  }

  async withArtifactLock<T>(_id: string, fn: () => Promise<T>): Promise<T> {
    return fn()
  }
}

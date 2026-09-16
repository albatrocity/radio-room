import type {
  ArtifactContentInput,
  ArtifactRetrieveAttempt,
  ArtifactUpdatePatch,
  ArtifactsPluginAPI,
  StoredArtifact,
  StoredArtifactPublic,
} from "@repo/types"
import { applyArtifactStoreWrite, applyArtifactUpdateWrite } from "@repo/game-logic"
import type { StudioRoom } from "./studioRoom"

export class MockStudioArtifactsApi implements ArtifactsPluginAPI {
  constructor(private readonly room: StudioRoom) {}

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
    return this.room.storedArtifacts.map(({ password: _p, ...rest }) => rest)
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

  async withArtifactLock<T>(_id: string, fn: () => Promise<T>): Promise<T> {
    return fn()
  }
}

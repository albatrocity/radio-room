import type {
  ArtifactRetrieveAttempt,
  ArtifactsPluginAPI,
  StoredArtifact,
  StoredArtifactPublic,
} from "@repo/types"
import type { StudioRoom } from "./studioRoom"

export class MockStudioArtifactsApi implements ArtifactsPluginAPI {
  constructor(private readonly room: StudioRoom) {}

  async store(artifact: Omit<StoredArtifact, "id">): Promise<string> {
    const id = crypto.randomUUID()
    const full: StoredArtifact = { ...artifact, id }
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
}

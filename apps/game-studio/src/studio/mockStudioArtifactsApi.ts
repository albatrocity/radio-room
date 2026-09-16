import type {
  ArtifactContentInput,
  ArtifactRetrieveAttempt,
  ArtifactUpdatePatch,
  ArtifactsPluginAPI,
  StoredArtifact,
  StoredArtifactPublic,
} from "@repo/types"
import { normalizeArtifactPayload, readArtifactContents, sanitizeStashLabel, sanitizeStashNote } from "@repo/game-logic"
import type { StudioRoom } from "./studioRoom"

function applyNormalized(artifact: StoredArtifact): StoredArtifact {
  const normalized = normalizeArtifactPayload(readArtifactContents(artifact), () =>
    crypto.randomUUID(),
  )
  const next: StoredArtifact = { ...artifact, ...normalized }
  if (normalized.coinValue === undefined) delete next.coinValue
  if (normalized.itemDefinitionId === undefined) delete next.itemDefinitionId
  if (normalized.itemName === undefined) delete next.itemName
  if (normalized.itemQuantity === undefined) delete next.itemQuantity
  return next
}

export class MockStudioArtifactsApi implements ArtifactsPluginAPI {
  constructor(private readonly room: StudioRoom) {}

  async store(
    artifact: Omit<StoredArtifact, "id" | "contents"> & { contents?: ArtifactContentInput[] },
  ): Promise<string> {
    const id = crypto.randomUUID()
    let full: StoredArtifact = applyNormalized({ ...artifact, id } as StoredArtifact)
    const label = sanitizeStashLabel(artifact.label)
    const note = sanitizeStashNote(artifact.note)
    if (label.status === "too_long") throw new Error("Stash name must be 32 characters or fewer.")
    if (note.status === "too_long") throw new Error("Stash note must be 140 characters or fewer.")
    if (label.status === "ok") full.label = label.value
    else delete full.label
    if (note.status === "ok") full.note = note.value
    else delete full.note
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
    const contents = patch.contents !== undefined ? patch.contents : readArtifactContents(artifact)
    let next = applyNormalized({
      ...artifact,
      contents: contents as StoredArtifact["contents"],
    })
    if (patch.containerDefinitionId !== undefined) {
      if (patch.containerDefinitionId == null || patch.containerDefinitionId === "") {
        delete next.containerDefinitionId
      } else {
        next.containerDefinitionId = patch.containerDefinitionId
      }
    }
    if ("label" in patch) {
      const result = sanitizeStashLabel(patch.label)
      if (result.status === "too_long") throw new Error("Stash name must be 32 characters or fewer.")
      if (result.status === "ok") next.label = result.value
      else delete next.label
    }
    if ("note" in patch) {
      const result = sanitizeStashNote(patch.note)
      if (result.status === "too_long") throw new Error("Stash note must be 140 characters or fewer.")
      if (result.status === "ok") next.note = result.value
      else delete next.note
    }
    this.room.updateStoredArtifact(next)
    return next
  }

  async withArtifactLock<T>(_id: string, fn: () => Promise<T>): Promise<T> {
    return fn()
  }
}

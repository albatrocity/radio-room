/**
 * Global stored artifacts — cross-room, password-protected item/coin storage.
 * @see docs/adrs/0052-global-artifacts-api.md
 */

export interface StoredArtifact {
  id: string
  storingPlugin: string
  storingItemId: string
  artifactType: "item" | "coin"
  itemDefinitionId?: string
  itemName?: string
  itemQuantity?: number
  coinValue?: number
  storedAt: number
  storedByUserId: string
  storedByUsername: string
  password: string
}

/** Public listing (password omitted). */
export type StoredArtifactPublic = Omit<StoredArtifact, "password">

export type ArtifactRetrieveAttempt =
  | { status: "success"; artifact: StoredArtifact }
  | { status: "not_found" }
  | { status: "wrong_password" }

/**
 * Cross-room artifact storage. Implemented server-side; plugins must not access Redis directly.
 */
export interface ArtifactsPluginAPI {
  store(artifact: Omit<StoredArtifact, "id">): Promise<string>
  getAll(): Promise<StoredArtifactPublic[]>
  attemptRetrieve(id: string, password: string): Promise<ArtifactRetrieveAttempt>
  remove(id: string): Promise<boolean>
}

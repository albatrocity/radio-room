/**
 * Global stored artifacts — cross-room, password-protected item/coin storage.
 * @see docs/adrs/0052-global-artifacts-api.md
 * @see docs/adrs/0179-reusable-multi-slot-password-stashes.md
 */

export type ArtifactCoinContent = { id: string; kind: "coin"; coinValue: number }
export type ArtifactItemContent = {
  id: string
  kind: "item"
  itemDefinitionId: string
  itemName: string
  itemQuantity: number
  /** Per-copy stack metadata (condition, punches). Round-trips through the stash. */
  metadata?: Record<string, unknown>
}
export type ArtifactContent = ArtifactCoinContent | ArtifactItemContent

/** Write shape — `id` is stamped by the artifacts API, not by callers. */
export type ArtifactContentInput =
  | (Omit<ArtifactCoinContent, "id"> & { id?: string })
  | (Omit<ArtifactItemContent, "id"> & { id?: string })

/** Narrow patch for `ArtifactsPluginAPI.update` — cannot rotate password or reassign storer. */
export type ArtifactUpdatePatch = {
  contents?: ArtifactContentInput[]
  containerDefinitionId?: string | null
  label?: string | null
  note?: string | null
}

export interface StoredArtifact {
  id: string
  storingPlugin: string
  storingItemId: string
  /**
   * @deprecated v1 shadow — kept populated when `contents.length === 1` so a
   * rollback mid-deploy can still read the row.
   */
  artifactType: "item" | "coin"
  /** @deprecated v1 shadow */
  itemDefinitionId?: string
  /** @deprecated v1 shadow */
  itemName?: string
  /** @deprecated v1 shadow */
  itemQuantity?: number
  /** @deprecated v1 shadow */
  coinValue?: number
  /** v2 payload. Absent on legacy rows; read through `readArtifactContents`. */
  contents?: ArtifactContent[]
  /**
   * Full item definition id of the container that created this stash.
   * Absent on legacy rows and studio-seeded artifacts — emptying those
   * returns contents only.
   */
  containerDefinitionId?: string | null
  /** Short public name, so a stasher can spot their own row in a shared list. Max 32 chars. */
  label?: string
  /** Public note — typically a password hint. Max 140 chars. */
  note?: string
  storedAt: number
  /**
   * Last completed password-granted action (create, deposit, withdraw), stamped
   * by the artifacts API — not settable through `update`. Absent on rows last
   * written before the field existed; read it through `artifactLastTouchedAt`,
   * which falls back to `storedAt`.
   */
  lastTouchedAt?: number
  storedByUserId: string
  storedByUsername: string
  password: string
}

/**
 * Public listing (password omitted). Item `contents` omit stack `metadata`;
 * ids, names, and quantities stay so Storage and the retrieve picker can render.
 * Retrieve/deposit still read the Redis row, which keeps metadata.
 */
export type StoredArtifactPublic = Omit<StoredArtifact, "password"> & {
  /**
   * Catalog capacity of the creating container. Hydrated at list time from
   * `ItemDefinition.storageCapacity` — not stored on the Redis row. The
   * container is usually gone from the viewer's bag, so Game State may not
   * include that definition.
   */
  storageCapacity?: number
  /** Catalog display name of the creating container, hydrated the same way. */
  containerName?: string
  /**
   * When the viewer holds a live access grant for this stash, set at list time
   * from `listAccessGrants(userId)` — never persisted on the Redis row.
   */
  accessGrantExpiresAt?: number
}

/** Short-lived password-free retrieve grant, stored per viewer (not on the artifact row). */
export type ArtifactAccessGrant = {
  artifactId: string
  userId: string
  source: string
  roomId?: string
  issuedAt: number
  expiresAt: number
}

export type ArtifactRetrieveAttempt =
  | { status: "success"; artifact: StoredArtifact }
  | { status: "not_found" }
  | { status: "wrong_password" }

/** Grant-based retrieve — separate union so the password path cannot regress. */
export type ArtifactGrantRetrieveAttempt =
  | { status: "success"; artifact: StoredArtifact }
  | { status: "not_found" }
  | { status: "no_grant" }

/**
 * Cross-room artifact storage. Implemented server-side; plugins must not access Redis directly.
 */
export interface ArtifactsPluginAPI {
  store(
    artifact: Omit<StoredArtifact, "id" | "contents"> & { contents?: ArtifactContentInput[] },
  ): Promise<string>
  getAll(): Promise<StoredArtifactPublic[]>
  attemptRetrieve(id: string, password: string): Promise<ArtifactRetrieveAttempt>
  remove(id: string): Promise<boolean>
  /**
   * Narrow in-place update. Re-runs content normalization. Returns null if the
   * id is missing.
   */
  update(id: string, patch: ArtifactUpdatePatch): Promise<StoredArtifact | null>
  /** `SET …:lock:<id> <token> NX EX 10`. Serializes retrieve / deposit. */
  withArtifactLock<T>(id: string, fn: () => Promise<T>): Promise<T>
  getPublic(id: string): Promise<StoredArtifactPublic | null>
  grantAccess(params: {
    artifactId: string
    userId: string
    source: string
    roomId?: string
    ttlMs?: number
  }): Promise<ArtifactAccessGrant | null>
  listAccessGrants(userId: string, now?: number): Promise<ArtifactAccessGrant[]>
  attemptRetrieveWithGrant(id: string, userId: string): Promise<ArtifactGrantRetrieveAttempt>
  revokeAccessGrant(artifactId: string, userId: string): Promise<boolean>
}

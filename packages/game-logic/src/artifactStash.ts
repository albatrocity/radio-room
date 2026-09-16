import type {
  ArtifactContent,
  ArtifactContentInput,
  ItemDefinition,
  ItemSlotPool,
  StoredArtifact,
  UserInventory,
} from "@repo/types"
import { ITEM_SLOT_POOLS, resolveSlotPool } from "@repo/types"

export const STASH_LABEL_MAX_CHARS = 32
export const STASH_NOTE_MAX_CHARS = 140

export type SanitizeStashTextResult =
  | { status: "absent" }
  | { status: "ok"; value: string }
  | { status: "too_long" }

function cleanStashText(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const cleaned = raw
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\t\n\r]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
  return cleaned.length > 0 ? cleaned : undefined
}

function sanitizeStashText(raw: unknown, maxChars: number): SanitizeStashTextResult {
  const cleaned = cleanStashText(raw)
  if (cleaned === undefined) return { status: "absent" }
  if (Array.from(cleaned).length > maxChars) return { status: "too_long" }
  return { status: "ok", value: cleaned }
}

export function sanitizeStashLabel(raw: unknown): SanitizeStashTextResult {
  return sanitizeStashText(raw, STASH_LABEL_MAX_CHARS)
}

export function sanitizeStashNote(raw: unknown): SanitizeStashTextResult {
  return sanitizeStashText(raw, STASH_NOTE_MAX_CHARS)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function readCoinContent(raw: unknown, fallbackId: string): ArtifactContent | null {
  if (!isRecord(raw) || raw.kind !== "coin") return null
  const coinValue = raw.coinValue
  if (typeof coinValue !== "number" || !Number.isFinite(coinValue) || coinValue < 1) return null
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId
  return { id, kind: "coin", coinValue: Math.floor(coinValue) }
}

function readItemContent(raw: unknown, fallbackId: string): ArtifactContent | null {
  if (!isRecord(raw) || raw.kind !== "item") return null
  const itemDefinitionId =
    typeof raw.itemDefinitionId === "string" ? raw.itemDefinitionId.trim() : ""
  if (!itemDefinitionId) return null
  const itemName =
    typeof raw.itemName === "string" && raw.itemName.trim() ? raw.itemName : itemDefinitionId
  const qty = raw.itemQuantity
  const itemQuantity =
    typeof qty === "number" && Number.isFinite(qty) && qty >= 1 ? Math.floor(qty) : 1
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId
  const metadata = isRecord(raw.metadata) ? raw.metadata : undefined
  return {
    id,
    kind: "item",
    itemDefinitionId,
    itemName,
    itemQuantity,
    ...(metadata ? { metadata } : {}),
  }
}

function shimLegacyContents(
  a: Pick<
    StoredArtifact,
    "id" | "artifactType" | "coinValue" | "itemDefinitionId" | "itemName" | "itemQuantity"
  >,
): ArtifactContent[] {
  if (a.artifactType === "coin") {
    const coinValue = a.coinValue
    if (typeof coinValue === "number" && Number.isFinite(coinValue) && coinValue >= 1) {
      return [
        {
          id: `legacy:${a.id}:coin`,
          kind: "coin",
          coinValue: Math.floor(coinValue),
        },
      ]
    }
    return []
  }
  const itemDefinitionId = a.itemDefinitionId?.trim()
  if (!itemDefinitionId) return []
  const qty = a.itemQuantity ?? 1
  return [
    {
      id: `legacy:${a.id}:item`,
      kind: "item",
      itemDefinitionId,
      itemName: a.itemName?.trim() || itemDefinitionId,
      itemQuantity: qty >= 1 ? Math.floor(qty) : 1,
    },
  ]
}

/**
 * Compat shim: an array `contents` is the v2 payload (an empty one means the
 * stash was emptied), v1 coin/item fields otherwise (ADR 0181).
 */
export function readArtifactContents(
  a: Pick<
    StoredArtifact,
    | "id"
    | "artifactType"
    | "contents"
    | "coinValue"
    | "itemDefinitionId"
    | "itemName"
    | "itemQuantity"
  >,
): ArtifactContent[] {
  if (Array.isArray(a.contents)) {
    const parsed: ArtifactContent[] = []
    for (let i = 0; i < a.contents.length; i++) {
      const fallbackId = `${a.id}:${i}`
      const row =
        readCoinContent(a.contents[i], fallbackId) ?? readItemContent(a.contents[i], fallbackId)
      if (row) parsed.push(row)
    }
    // Only an array whose every row is unreadable falls back to the v1 shadow.
    if (parsed.length > 0 || a.contents.length === 0) return parsed
  }
  return shimLegacyContents(a)
}

/** Positive `storageCapacity` from a definition, else `undefined`. */
export function readStorageCapacity(
  definition?: { storageCapacity?: number } | null,
): number | undefined {
  const n = definition?.storageCapacity
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return undefined
  return Math.floor(n)
}

/**
 * Remaining deposit slots. `undefined` means the catalog capacity is unknown —
 * do not treat occupied length as the cap (the container is usually gone from
 * the bag, so Game State may not have its definition).
 */
export function remainingStashSlots(
  occupied: number,
  storageCapacity: number | undefined,
): number | undefined {
  if (storageCapacity == null) return undefined
  return Math.max(0, storageCapacity - Math.max(0, occupied))
}

/**
 * Attach the container's catalog capacity and name for the listing UI (not
 * persisted). The container is usually out of the bag while its stash exists,
 * so the client cannot look either up from Game State.
 */
export function hydrateStoredArtifactContainers<
  T extends { containerDefinitionId?: string | null },
>(
  artifacts: T[],
  definitionsById: Readonly<
    Record<string, { storageCapacity?: number; name?: string } | undefined>
  >,
): Array<T & { storageCapacity?: number; containerName?: string }> {
  return artifacts.map((a) => {
    const id = a.containerDefinitionId?.trim()
    const def = id ? definitionsById[id] : undefined
    const storageCapacity = readStorageCapacity(def)
    const containerName = def?.name?.trim() || undefined
    if (storageCapacity == null && containerName == null) return a
    return {
      ...a,
      ...(storageCapacity != null ? { storageCapacity } : {}),
      ...(containerName != null ? { containerName } : {}),
    }
  })
}

export type NormalizedArtifactPayload = {
  contents: ArtifactContent[]
  artifactType: "item" | "coin"
  coinValue?: number
  itemDefinitionId?: string
  itemName?: string
  itemQuantity?: number
}

export function normalizeArtifactPayload(
  contentsInput: ArtifactContentInput[],
  nextId: () => string,
): NormalizedArtifactPayload {
  const contents: ArtifactContent[] = contentsInput.map((c) => {
    const id = c.id?.trim() || nextId()
    if (c.kind === "coin") {
      return { id, kind: "coin" as const, coinValue: Math.floor(c.coinValue) }
    }
    return {
      id,
      kind: "item" as const,
      itemDefinitionId: c.itemDefinitionId,
      itemName: c.itemName,
      itemQuantity: c.itemQuantity >= 1 ? Math.floor(c.itemQuantity) : 1,
      ...(c.metadata != null ? { metadata: c.metadata } : {}),
    }
  })

  if (contents.length === 1) {
    const only = contents[0]!
    if (only.kind === "coin") {
      return { contents, artifactType: "coin", coinValue: only.coinValue }
    }
    return {
      contents,
      artifactType: "item",
      itemDefinitionId: only.itemDefinitionId,
      itemName: only.itemName,
      itemQuantity: only.itemQuantity,
    }
  }

  return { contents, artifactType: "item" }
}

function itemSummary(c: Extract<ArtifactContent, { kind: "item" }>): string {
  return c.itemQuantity > 1 ? `${c.itemName} ×${c.itemQuantity}` : c.itemName
}

function coinSummary(value: number): string {
  return `${value.toLocaleString()} coins`
}

export function artifactSummaryLabel(contents: ArtifactContent[]): string {
  const coins = contents.filter(
    (c): c is Extract<ArtifactContent, { kind: "coin" }> => c.kind === "coin",
  )
  const items = contents.filter(
    (c): c is Extract<ArtifactContent, { kind: "item" }> => c.kind === "item",
  )
  const coinTotal = coins.reduce((sum, c) => sum + c.coinValue, 0)

  if (items.length === 0 && coinTotal > 0) return coinSummary(coinTotal)
  if (items.length === 1 && coinTotal === 0) return itemSummary(items[0]!)
  if (items.length === 0 && coinTotal === 0) return "Empty"

  if (coinTotal > 0) {
    const itemBit = items.length === 1 ? itemSummary(items[0]!) : `${items.length} items`
    return `${itemBit} + ${coinSummary(coinTotal)}`
  }
  if (items.length === 1) return itemSummary(items[0]!)
  return `${items.length} items`
}

export function computeFreeSlotsByPool(
  items: readonly { definitionId: string }[],
  caps: Pick<UserInventory, "maxSlots" | "maxCollectionSlots" | "maxPlaybackSlots">,
  definitionsById: Readonly<Record<string, { slotPool?: string | null } | undefined>>,
): Record<ItemSlotPool, number> {
  const used: Record<ItemSlotPool, number> = { inventory: 0, collection: 0, playback: 0 }
  for (const item of items) {
    used[resolveSlotPool(definitionsById[item.definitionId])] += 1
  }
  return {
    inventory: Math.max(0, caps.maxSlots - used.inventory),
    collection: Math.max(0, caps.maxCollectionSlots - used.collection),
    playback: Math.max(0, caps.maxPlaybackSlots - used.playback),
  }
}

export type PlanWithdrawalInput = {
  contents: ArtifactContent[]
  selectedIds?: string[]
  containerDefinitionId?: string | null
  freeSlotsByPool: Record<ItemSlotPool, number>
  definitionsById: Readonly<Record<string, Pick<ItemDefinition, "slotPool" | "id"> | undefined>>
}

export type PlanWithdrawalResult = {
  deliveries: ArtifactContent[]
  remainder: ArtifactContent[]
  container?: { definitionId: string }
  /**
   * The stash is (or becomes) empty and has a container, but no free slot to
   * return it to. Deliveries still go through and the empty stash stays listed
   * so the container can be claimed later (ADR 0181).
   */
  containerBlocked: boolean
  rejected: ArtifactContent[]
}

export function planWithdrawal(input: PlanWithdrawalInput): PlanWithdrawalResult {
  const selectedSet = input.selectedIds != null ? new Set(input.selectedIds) : null
  const deliveries =
    selectedSet == null ? [...input.contents] : input.contents.filter((c) => selectedSet.has(c.id))
  const remainder = selectedSet == null ? [] : input.contents.filter((c) => !selectedSet.has(c.id))

  const needed: Record<ItemSlotPool, number> = { inventory: 0, collection: 0, playback: 0 }
  for (const d of deliveries) {
    if (d.kind === "coin") continue
    needed[resolveSlotPool(input.definitionsById[d.itemDefinitionId])] += 1
  }

  if (ITEM_SLOT_POOLS.some((pool) => needed[pool] > input.freeSlotsByPool[pool])) {
    return {
      deliveries: [],
      remainder: [...input.contents],
      containerBlocked: false,
      rejected: deliveries,
    }
  }

  const containerId = remainder.length === 0 ? input.containerDefinitionId?.trim() : undefined
  if (!containerId) return { deliveries, remainder, containerBlocked: false, rejected: [] }

  const containerPool = resolveSlotPool(input.definitionsById[containerId])
  if (needed[containerPool] + 1 > input.freeSlotsByPool[containerPool]) {
    return { deliveries, remainder, containerBlocked: true, rejected: [] }
  }

  return {
    deliveries,
    remainder,
    container: { definitionId: containerId },
    containerBlocked: false,
    rejected: [],
  }
}

/**
 * Default selection for the retrieve picker: every coin row plus the items
 * whose pool still has room, in list order. No slot is reserved for the
 * container — taking everything is allowed without getting the container back.
 */
export function selectFittingContentIds(
  contents: ArtifactContent[],
  freeSlotsByPool: Record<ItemSlotPool, number>,
  definitionsById: Readonly<Record<string, Pick<ItemDefinition, "slotPool" | "id"> | undefined>>,
): string[] {
  const taken: Record<ItemSlotPool, number> = { inventory: 0, collection: 0, playback: 0 }
  const ids: string[] = []
  for (const c of contents) {
    if (c.kind === "coin") {
      ids.push(c.id)
      continue
    }
    const pool = resolveSlotPool(definitionsById[c.itemDefinitionId])
    if (taken[pool] + 1 > freeSlotsByPool[pool]) continue
    taken[pool] += 1
    ids.push(c.id)
  }
  return ids
}

export type PlanDepositInput = {
  contents: ArtifactContent[]
  capacity: number
  incoming: ArtifactContentInput[]
}

export type PlanDepositResult = {
  nextContents: ArtifactContentInput[]
  rejected: ArtifactContentInput[]
}

export function planDeposit(input: PlanDepositInput): PlanDepositResult {
  const nextContents: ArtifactContentInput[] = input.contents.map((c) =>
    c.kind === "coin" ? { ...c } : { ...c, metadata: c.metadata ? { ...c.metadata } : undefined },
  )
  const rejected: ArtifactContentInput[] = []
  const cap = Math.max(0, Math.floor(input.capacity))

  for (const row of input.incoming) {
    if (row.kind === "coin") {
      const existing = nextContents.find((c) => c.kind === "coin")
      if (existing && existing.kind === "coin") {
        existing.coinValue += row.coinValue
        continue
      }
      if (nextContents.length >= cap) {
        rejected.push(row)
        continue
      }
      nextContents.push({
        kind: "coin",
        coinValue: row.coinValue,
        ...(row.id ? { id: row.id } : {}),
      })
      continue
    }
    if (nextContents.length >= cap) {
      rejected.push(row)
      continue
    }
    nextContents.push({ ...row })
  }

  return { nextContents, rejected }
}

function joinEnglish(parts: string[]): string {
  if (parts.length === 0) return "nothing"
  if (parts.length === 1) return parts[0]!
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`
}

function deliveryName(c: ArtifactContent): string {
  if (c.kind === "coin") return coinSummary(c.coinValue)
  return itemSummary(c)
}

function stripTrailingPeriod(s: string): string {
  return s.endsWith(".") ? s.slice(0, -1) : s
}

function countPhrase(n: number): string {
  if (n === 1) return "one thing"
  if (n === 2) return "two things"
  return `${n} things`
}

export type SummarizeWithdrawalInput = {
  username: string
  deliveries: ArtifactContent[]
  containerName?: string | null
  containerReturned?: boolean
}

export type StashOpSummary = {
  roomMessage: string
  privateMessage: string
}

export function summarizeWithdrawal(input: SummarizeWithdrawalInput): StashOpSummary {
  const { username, deliveries } = input
  let roomMessage: string
  let privateMessage: string

  if (deliveries.length === 0 && input.containerReturned) {
    const name = input.containerName?.trim() || "container"
    return {
      roomMessage: `${username} picked up the empty ${name} from storage.`,
      privateMessage: `The empty ${name} is back in your bag.`,
    }
  }

  if (deliveries.length === 1) {
    const only = deliveries[0]!
    if (only.kind === "coin") {
      const amt = only.coinValue.toLocaleString()
      roomMessage = `${username} retrieved ${amt} coins from storage.`
      privateMessage = `Added ${amt} coins.`
    } else {
      const label = only.itemName || "an item"
      roomMessage = `${username} retrieved ${label} from storage.`
      privateMessage = `Received ${label}.`
    }
  } else {
    const names = joinEnglish(deliveries.map(deliveryName))
    const from = input.containerName?.trim()
      ? `from the ${input.containerName.trim()}`
      : "from storage"
    roomMessage = `${username} took ${names} ${from}.`
    privateMessage = `Received ${names}.`
  }

  if (input.containerReturned && input.containerName?.trim()) {
    const name = input.containerName.trim()
    roomMessage = `${stripTrailingPeriod(roomMessage)} and pocketed the empty ${name}.`
    privateMessage = `${stripTrailingPeriod(privateMessage)}. The empty ${name} is back in your bag.`
  }

  return { roomMessage, privateMessage }
}

export type SummarizeDepositInput = {
  username: string
  incoming: ArtifactContentInput[]
  containerName?: string | null
}

export function summarizeDeposit(input: SummarizeDepositInput): StashOpSummary {
  const dest = input.containerName?.trim() ? `a ${input.containerName.trim()}` : "a stash"
  const n = input.incoming.length
  let added: string
  if (n === 1) {
    const only = input.incoming[0]!
    added = only.kind === "coin" ? coinSummary(only.coinValue) : `a ${only.itemName}`
  } else {
    added = countPhrase(n)
  }
  return {
    roomMessage: `${input.username} added ${added} to ${dest}.`,
    privateMessage: "Added to stash.",
  }
}

/** @deprecated Use summarizeWithdrawal / summarizeDeposit. */
export function summarizeStashOp(
  kind: "withdraw" | "deposit",
  input: SummarizeWithdrawalInput | SummarizeDepositInput,
): StashOpSummary {
  if (kind === "withdraw") return summarizeWithdrawal(input as SummarizeWithdrawalInput)
  return summarizeDeposit(input as SummarizeDepositInput)
}

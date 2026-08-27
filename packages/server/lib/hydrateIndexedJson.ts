import type { RedisContext } from "@repo/types"

/**
 * Load JSON records from a Redis SET of ids (SMEMBERS + MGET).
 * Drops missing / invalid rows from the index (and all-set); callers handle TTL.
 */
export async function hydrateIndexedJson<T>(params: {
  redis: RedisContext
  indexKey: string
  allSetKey: string
  recordKey: (id: string) => string
  onRecord: (record: T, id: string) => Promise<"keep" | "drop">
}): Promise<T[]> {
  const client = params.redis.pubClient
  const ids = await client.sMembers(params.indexKey)
  if (ids.length === 0) return []
  const raws = await client.mGet(ids.map((id) => params.recordKey(id)))

  const missing: string[] = []
  const invalid: string[] = []
  const parsed: { id: string; record: T }[] = []

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!
    const raw = raws[i]
    if (!raw) {
      missing.push(id)
      continue
    }
    try {
      parsed.push({ id, record: JSON.parse(raw) as T })
    } catch {
      invalid.push(id)
    }
  }

  const dropIds = [...missing, ...invalid]
  if (dropIds.length > 0) {
    const tx = client.multi()
    tx.sRem(params.indexKey, dropIds)
    tx.sRem(params.allSetKey, dropIds)
    if (invalid.length > 0) {
      tx.del(invalid.map((id) => params.recordKey(id)))
    }
    await tx.exec()
  }

  const out: T[] = []
  for (const { id, record } of parsed) {
    if ((await params.onRecord(record, id)) === "keep") {
      out.push(record)
    }
  }
  return out
}

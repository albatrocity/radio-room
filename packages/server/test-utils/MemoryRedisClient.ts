/**
 * In-memory Redis mock for unit tests.
 * Supports strings, hashes, and sorted sets — enough to cover the data layer.
 */
export class MemoryRedisClient {
  private strings = new Map<string, string>()
  private hashes = new Map<string, Map<string, string>>()
  private zsets = new Map<string, Map<string, number>>()

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.strings.set(key, value)
  }

  async del(key: string | string[]): Promise<void> {
    for (const k of Array.isArray(key) ? key : [key]) {
      this.strings.delete(k)
    }
  }

  async keys(pattern: string): Promise<string[]> {
    // Support Redis glob `*` (matches any run of characters).
    const regex = new RegExp(
      "^" + pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
    )
    return [...this.strings.keys()].filter((k) => regex.test(k))
  }

  async unlink(key: string): Promise<void> {
    this.strings.delete(key)
    this.hashes.delete(key)
    this.zsets.delete(key)
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return this.hashes.get(key)?.get(field)
  }

  async hSet(
    key: string,
    fieldOrEntries: string | Record<string, string>,
    value?: string,
  ): Promise<number> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map())
    }
    const hash = this.hashes.get(key)!

    if (typeof fieldOrEntries === "object") {
      for (const [field, val] of Object.entries(fieldOrEntries)) {
        hash.set(field, val)
      }
      return Object.keys(fieldOrEntries).length
    }

    const isNew = !hash.has(fieldOrEntries)
    hash.set(fieldOrEntries, value!)
    return isNew ? 1 : 0
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key)
    if (!hash) return {}
    return Object.fromEntries(hash.entries())
  }

  async hLen(key: string): Promise<number> {
    return this.hashes.get(key)?.size ?? 0
  }

  async zAdd(
    key: string,
    entry: { score: number; value: string } | { score: number; value: string }[],
  ): Promise<void> {
    if (!this.zsets.has(key)) {
      this.zsets.set(key, new Map())
    }
    const zset = this.zsets.get(key)!
    const entries = Array.isArray(entry) ? entry : [entry]
    for (const { score, value } of entries) {
      zset.set(value, score)
    }
  }

  async zRem(key: string, member: string): Promise<void> {
    this.zsets.get(key)?.delete(member)
  }

  async zRange(
    key: string,
    start: number,
    stop: number,
    opts?: { REV?: boolean },
  ): Promise<string[]> {
    const zset = this.zsets.get(key)
    if (!zset) return []

    const sorted = [...zset.entries()].sort((a, b) =>
      opts?.REV ? b[1] - a[1] : a[1] - b[1],
    )
    const len = sorted.length
    if (len === 0) return []

    // Redis ZRANGE: start/stop are inclusive; negative stop counts from the end.
    let from = start < 0 ? len + start : start
    let to = stop < 0 ? len + stop : stop
    if (from >= len || to < 0) return []
    from = Math.max(0, from)
    to = Math.min(to, len - 1)
    if (from > to) return []

    return sorted.slice(from, to + 1).map(([member]) => member)
  }

  async zRank(key: string, member: string): Promise<number | null> {
    const zset = this.zsets.get(key)
    if (!zset || !zset.has(member)) return null
    const sorted = [...zset.entries()].sort((a, b) => a[1] - b[1])
    return sorted.findIndex(([m]) => m === member)
  }

  async zCard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0
  }
}

/**
 * In-memory Redis mock for unit tests.
 * Supports strings, hashes, sets, and sorted sets — enough to cover the data layer.
 */
export class MemoryRedisClient {
  private strings = new Map<string, string>()
  private hashes = new Map<string, Map<string, string>>()
  private sets = new Map<string, Set<string>>()
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
      this.hashes.delete(k)
      this.sets.delete(k)
      this.zsets.delete(k)
    }
  }

  async exists(key: string): Promise<number> {
    if (this.strings.has(key) || this.hashes.has(key) || this.sets.has(key) || this.zsets.has(key)) {
      return 1
    }
    return 0
  }

  async keys(pattern: string): Promise<string[]> {
    // Support Redis glob `*` (matches any run of characters).
    const regex = new RegExp(
      "^" + pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
    )
    const all = new Set([
      ...this.strings.keys(),
      ...this.hashes.keys(),
      ...this.sets.keys(),
      ...this.zsets.keys(),
    ])
    return [...all].filter((k) => regex.test(k))
  }

  async unlink(key: string): Promise<void> {
    this.strings.delete(key)
    this.hashes.delete(key)
    this.sets.delete(key)
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

  async hSetNX(key: string, field: string, value: string): Promise<number> {
    if (!this.hashes.has(key)) {
      this.hashes.set(key, new Map())
    }
    const hash = this.hashes.get(key)!
    if (hash.has(field)) return 0
    hash.set(field, value)
    return 1
  }

  async sAdd(key: string, member: string): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set())
    }
    const set = this.sets.get(key)!
    if (set.has(member)) return 0
    set.add(member)
    return 1
  }

  async sRem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key)
    if (!set?.has(member)) return 0
    set.delete(member)
    return 1
  }

  async sMembers(key: string): Promise<string[]> {
    const set = this.sets.get(key)
    if (!set) return []
    return [...set]
  }

  async mGet(keys: string[]): Promise<(string | null)[]> {
    return keys.map((k) => this.strings.get(k) ?? null)
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

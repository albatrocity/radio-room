/**
 * In-memory Redis mock for unit tests.
 * Supports strings, hashes, sets, and sorted sets — enough to cover the data layer.
 */
export class MemoryRedisClient {
  private strings = new Map<string, string>()
  private hashes = new Map<string, Map<string, string>>()
  private sets = new Map<string, Set<string>>()
  private zsets = new Map<string, Map<string, number>>()
  private lists = new Map<string, string[]>()

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null
  }

  async set(
    key: string,
    value: string,
    options?: { NX?: boolean; EX?: number; PX?: number },
  ): Promise<string | null> {
    if (options?.NX && this.strings.has(key)) {
      return null
    }
    this.strings.set(key, value)
    // TTL is ignored in memory (locks are short-lived and tests don't expire).
    void options?.EX
    void options?.PX
    return "OK"
  }

  async del(key: string | string[]): Promise<void> {
    for (const k of Array.isArray(key) ? key : [key]) {
      this.strings.delete(k)
      this.hashes.delete(k)
      this.sets.delete(k)
      this.zsets.delete(k)
      this.lists.delete(k)
    }
  }

  async exists(key: string): Promise<number> {
    if (
      this.strings.has(key) ||
      this.hashes.has(key) ||
      this.sets.has(key) ||
      this.zsets.has(key) ||
      this.lists.has(key)
    ) {
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
      ...this.lists.keys(),
    ])
    return [...all].filter((k) => regex.test(k))
  }

  async unlink(key: string): Promise<void> {
    this.strings.delete(key)
    this.hashes.delete(key)
    this.sets.delete(key)
    this.zsets.delete(key)
    this.lists.delete(key)
  }

  // ---------- List operations --------------------------------------------

  async lPush(key: string, ...values: string[]): Promise<number> {
    if (!this.lists.has(key)) this.lists.set(key, [])
    const list = this.lists.get(key)!
    list.unshift(...values)
    return list.length
  }

  async lTrim(key: string, start: number, stop: number): Promise<void> {
    const list = this.lists.get(key)
    if (!list) return
    const len = list.length
    let from = start < 0 ? Math.max(len + start, 0) : start
    let to = stop < 0 ? len + stop : stop
    if (from > to || from >= len) {
      this.lists.delete(key)
      return
    }
    from = Math.max(0, from)
    to = Math.min(to, len - 1)
    const trimmed = list.slice(from, to + 1)
    this.lists.set(key, trimmed)
  }

  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key)
    if (!list || list.length === 0) return []
    const len = list.length
    let from = start < 0 ? Math.max(len + start, 0) : start
    let to = stop < 0 ? len + stop : stop
    if (from >= len || from > to) return []
    from = Math.max(0, from)
    to = Math.min(to, len - 1)
    return list.slice(from, to + 1)
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    return this.hashes.get(key)?.get(field)
  }

  async hDel(key: string, field: string | string[]): Promise<number> {
    const hash = this.hashes.get(key)
    if (!hash) return 0
    const fields = Array.isArray(field) ? field : [field]
    let removed = 0
    for (const f of fields) {
      if (hash.delete(f)) removed += 1
    }
    return removed
  }

  async hmGet(key: string, fields: string[]): Promise<(string | null)[]> {
    const hash = this.hashes.get(key)
    return fields.map((field) => hash?.get(field) ?? null)
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

  async sIsMember(key: string, member: string): Promise<boolean> {
    return this.sets.get(key)?.has(member) ?? false
  }

  async sRem(key: string, member: string | string[]): Promise<number> {
    const set = this.sets.get(key)
    if (!set) return 0
    const members = Array.isArray(member) ? member : [member]
    let removed = 0
    for (const m of members) {
      if (set.delete(m)) removed += 1
    }
    return removed
  }

  multi() {
    const cmds: Array<() => Promise<unknown>> = []
    const enqueue = (fn: () => Promise<unknown>) => {
      cmds.push(fn)
      return api
    }
    const api = {
      sRem: (key: string, member: string | string[]) => enqueue(() => this.sRem(key, member)),
      del: (key: string | string[]) => enqueue(() => this.del(key)),
      exec: async () => {
        const results: unknown[] = []
        for (const cmd of cmds) {
          results.push(await cmd())
        }
        return results
      },
    }
    return api
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

  async zRem(key: string, member: string | string[]): Promise<number> {
    const zset = this.zsets.get(key)
    if (!zset) return 0
    const members = Array.isArray(member) ? member : [member]
    let removed = 0
    for (const m of members) {
      if (zset.delete(m)) removed += 1
    }
    return removed
  }

  async zRange(
    key: string,
    start: number | string,
    stop: number | string,
    opts?: { REV?: boolean; BY?: "SCORE" | "LEX" },
  ): Promise<string[]> {
    const zset = this.zsets.get(key)
    if (!zset) return []

    const sorted = [...zset.entries()].sort((a, b) =>
      opts?.REV ? b[1] - a[1] : a[1] - b[1],
    )
    const len = sorted.length
    if (len === 0) return []

    if (opts?.BY === "SCORE") {
      const min =
        start === "-inf" ? Number.NEGATIVE_INFINITY : typeof start === "number" ? start : Number(start)
      const max =
        stop === "+inf" ? Number.POSITIVE_INFINITY : typeof stop === "number" ? stop : Number(stop)
      return sorted.filter(([, score]) => score >= min && score <= max).map(([member]) => member)
    }

    // Redis ZRANGE: start/stop are inclusive; negative stop counts from the end.
    const startIdx = typeof start === "number" ? start : Number(start)
    const stopIdx = typeof stop === "number" ? stop : Number(stop)
    let from = startIdx < 0 ? len + startIdx : startIdx
    let to = stopIdx < 0 ? len + stopIdx : stopIdx
    if (from >= len || to < 0) return []
    from = Math.max(0, from)
    to = Math.min(to, len - 1)
    if (from > to) return []

    return sorted.slice(from, to + 1).map(([member]) => member)
  }

  async zRangeByScore(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<string[]> {
    return this.zRange(key, min, max, { BY: "SCORE" })
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

  async zCount(key: string, min: number | string, max: number | string): Promise<number> {
    const members = await this.zRange(key, min, max, { BY: "SCORE" })
    return members.length
  }

  /**
   * Minimal EVAL support for scripts used in unit tests.
   * Recognizes CLAIM_DUE_MEMBERS / CLAIM_DUE_AUTO_CLOSES and generic GET/SET CAS.
   */
  async eval(
    script: string,
    opts: { keys: string[]; arguments?: (string | number)[] },
  ): Promise<unknown> {
    const key = opts.keys[0]
    const args = (opts.arguments ?? []).map(String)
    if (!key) return null

    if (script.includes("CLAIM_DUE_MEMBERS") || script.includes("CLAIM_DUE_AUTO_CLOSES")) {
      const now = Number(args[0])
      const members = await this.zRange(key, "-inf", now, { BY: "SCORE" })
      const claimed: string[] = []
      for (const member of members) {
        if ((await this.zRem(key, member)) === 1) claimed.push(member)
      }
      return claimed
    }

    // PluginStorage compareAndSet Lua (expected-present flag, expected, value, ttl)
    if (script.includes("redis.call('GET'") && script.includes("redis.call('SET'")) {
      const expectPresent = args[0] === "1"
      const expected = args[1] ?? ""
      const value = args[2] ?? ""
      const ttl = args[3] ?? ""
      const cur = await this.get(key)
      if (expectPresent) {
        if (cur !== expected) return 0
      } else if (cur != null) {
        return 0
      }
      await this.set(key, value)
      void ttl
      return 1
    }

    throw new Error(`MemoryRedisClient.eval: unsupported script`)
  }
}

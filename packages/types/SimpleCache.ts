export interface SimpleCache {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  delete(key: string): Promise<void>
  /** Delete all keys whose string form starts with `prefix` (e.g. room browse cache). */
  deleteByPrefix(prefix: string): Promise<void>
}

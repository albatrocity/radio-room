/** Cap playlist/album track-id RPCs during Physical Media de-dup (daemon album unions use 8). */
export const DEDUP_RPC_CONCURRENCY = 8

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, concurrency)
  const out: R[] = new Array(items.length)
  let next = 0

  const worker = async () => {
    for (;;) {
      const i = next
      next += 1
      if (i >= items.length) return
      out[i] = await mapper(items[i]!, i)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return out
}

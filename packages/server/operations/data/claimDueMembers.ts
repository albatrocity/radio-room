import type { AppContext } from "@repo/types"

/**
 * Claim due sorted-set members in one Redis round-trip (ADR 0190 / 0191).
 * Marker: CLAIM_DUE_MEMBERS — MemoryRedisClient.eval recognizes this script
 * (and the older CLAIM_DUE_AUTO_CLOSES alias).
 * ARGV[1] = now (score upper bound). Returns members successfully ZREM'd (claim won).
 */
export const CLAIM_DUE_MEMBERS_LUA = `
-- CLAIM_DUE_MEMBERS
-- CLAIM_DUE_AUTO_CLOSES
local members = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local claimed = {}
for _, member in ipairs(members) do
  if redis.call('ZREM', KEYS[1], member) == 1 then
    table.insert(claimed, member)
  end
end
return claimed
`

/**
 * Claim due members from a Redis ZSET scored by fire/expiry time.
 * Empty set short-circuits with ZCOUNT; non-empty claims via atomic Lua so
 * multi-dyno ZREM races stay one RTT.
 */
export async function claimDueMembers({
  context,
  key,
  now = Date.now(),
}: {
  context: AppContext
  key: string
  now?: number
}): Promise<string[]> {
  const client = context.redis.pubClient
  const dueCount = await client.zCount(key, "-inf", now)
  if (dueCount === 0) return []

  const raw = (await client.eval(CLAIM_DUE_MEMBERS_LUA, {
    keys: [key],
    arguments: [String(now)],
  })) as string[]

  return raw ?? []
}

/** Device session tokens live on the API's Redis. Link codes do not. */

const SESSION_TTL_SEC = 7 * 24 * 60 * 60

export type StoredDeviceSession = {
  daemonId: string
  roomId: string | null
}

type RedisCmd = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, options?: { EX: number }) => Promise<unknown>
  expire: (key: string, seconds: number) => Promise<unknown>
}

function sessionKey(token: string): string {
  return `device:session:${token}`
}

export async function saveDeviceSession(
  redis: RedisCmd,
  token: string,
  session: StoredDeviceSession,
): Promise<void> {
  await redis.set(sessionKey(token), JSON.stringify(session), { EX: SESSION_TTL_SEC })
}

export async function readDeviceSession(
  redis: RedisCmd,
  token: string,
): Promise<StoredDeviceSession | null> {
  const raw = await redis.get(sessionKey(token))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredDeviceSession
    if (!parsed || typeof parsed.daemonId !== "string") return null
    return {
      daemonId: parsed.daemonId,
      roomId: typeof parsed.roomId === "string" ? parsed.roomId : null,
    }
  } catch {
    return null
  }
}

export async function touchDeviceSession(redis: RedisCmd, token: string): Promise<void> {
  await redis.expire(sessionKey(token), SESSION_TTL_SEC)
}

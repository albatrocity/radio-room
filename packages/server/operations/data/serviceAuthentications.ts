import { AppContext } from "@repo/types"

export type ServiceAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt?: number
}

type StoreUserServiceAuthParams = {
  context: AppContext
  userId: string
  serviceName: string
  tokens: ServiceAuthTokens
}

export async function storeUserServiceAuth({
  context,
  userId,
  serviceName,
  tokens,
}: StoreUserServiceAuthParams): Promise<void> {
  const key = `user:${userId}:auth:${serviceName}`
  await context.redis.pubClient.hSet(key, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt?.toString() ?? "",
    updatedAt: Date.now().toString(),
  })
}

type GetUserServiceAuthParams = {
  context: AppContext
  userId: string
  serviceName: string
}

export async function getUserServiceAuth({
  context,
  userId,
  serviceName,
}: GetUserServiceAuthParams): Promise<ServiceAuthTokens | null> {
  const key = `user:${userId}:auth:${serviceName}`
  const data = await context.redis.pubClient.hGetAll(key)

  if (!data || !data.accessToken) {
    return null
  }

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt ? parseInt(data.expiresAt) : undefined,
  }
}

type RemoveUserServiceAuthParams = {
  context: AppContext
  userId: string
  serviceName: string
}

export async function removeUserServiceAuth({
  context,
  userId,
  serviceName,
}: RemoveUserServiceAuthParams): Promise<void> {
  const key = `user:${userId}:auth:${serviceName}`
  await context.redis.pubClient.del(key)
}

/**
 * Alias for removeUserServiceAuth (for backward compatibility)
 */
export const deleteUserServiceAuth = removeUserServiceAuth

type GetUserServicesParams = {
  context: AppContext
  userId: string
}

export async function getUserServices({
  context,
  userId,
}: GetUserServicesParams): Promise<string[]> {
  const pattern = `user:${userId}:auth:*`
  const keys = await context.redis.pubClient.keys(pattern)
  return keys.map((key) => key.split(":")[3])
}


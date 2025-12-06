import { objectKeys } from "../../lib/tsExtras"
import { isNullish, isEmpty } from "remeda"

import {
  Reaction,
  Room,
  StoredRoomMeta,
  AppContext,
  User,
  StoredUser,
  ChatMessage,
} from "@repo/types"
import { filter, isTruthy } from "remeda"

type HSetOptions = {
  PX?: number
}

type WriteJsonToHsetParams = {
  context: AppContext
  setKey: string
  attributes: Partial<User | Room | ChatMessage | Reaction | StoredRoomMeta>
  options?: HSetOptions
}

export async function writeJsonToHset({
  context,
  setKey,
  attributes,
  options = {},
}: WriteJsonToHsetParams) {
  const writes = objectKeys(attributes).map((key) => {
    if (!isNullish(attributes[key])) {
      return context.redis.pubClient.hSet(setKey, key, String(attributes[key]))
    }
  })
  if (options.PX) {
    context.redis.pubClient.pExpire(setKey, options.PX)
  }
  return Promise.all(writes)
}

type HSet = {
  [x: string]: string
}

export function hSetToObject(hset: HSet) {
  objectKeys(hset).reduce((acc, key) => {
    hset[key] = JSON.parse(hset[key])
    return acc
  }, hset)
  return hset
}

type GetMembersFromSetParams<T> = {
  context: AppContext
  setKey: string
  recordPrefix: string
  recordSuffix?: string
}

// Gets keys from Redis that are indexed in a set
export async function getMembersFromSet<T>({
  context,
  setKey,
  recordPrefix,
  recordSuffix,
}: GetMembersFromSetParams<T>) {
  const members = await context.redis.pubClient.sMembers(setKey)

  const reads = members.map(async (key) => {
    try {
      const record = `${recordPrefix}:${key}${recordSuffix ? `:${recordSuffix}` : ""}`
      const attributes = await context.redis.pubClient.hGetAll(record)
      if (isEmpty(attributes)) {
        // If record is empty, remove key from set
        context.redis.pubClient.sRem(setKey, key)
        return null
      } else {
        const typed = JSON.parse(JSON.stringify(attributes)) as T
        return { id: key, ...typed } as T
      }
    } catch (e) {
      console.error("ERROR FROM data/utils/getMembersFromSet", e)
    }
  })

  try {
    const docs = await Promise.all(reads)
    return filter(docs, isTruthy)
  } catch (e) {
    console.error("ERROR FROM data/utils/getMembersFromSet", e)
    return []
  }
}

type GetHMembersFromSetParams<T> = {
  context: AppContext
  setKey: string
  recordPrefix: string
  recordSuffix?: string
}

// Gets keys from Redis that are indexed in a hset
export async function getHMembersFromSet<T>({
  context,
  setKey,
  recordPrefix,
  recordSuffix,
}: GetHMembersFromSetParams<T>) {
  const members = await context.redis.pubClient.sMembers(setKey)

  const reads = members.map(async (key) => {
    try {
      const record = `${recordPrefix}:${key}${recordSuffix ? `:${recordSuffix}` : ""}`
      const attributes = await context.redis.pubClient.hGetAll(record)
      const parsedAttributes = objectKeys(attributes).reduce(
        (acc, key) => {
          try {
            if (attributes[key]) {
              // @ts-ignore
              acc[key] = JSON.parse(attributes[key])
            }
          } catch (e) {
            // Not an error - just a plain string value that doesn't need JSON parsing
            // @ts-ignore
            acc[key] = attributes[key]
          }
          return acc
        },
        {} as Record<string, any>,
      )
      return parsedAttributes as T
    } catch (e) {
      console.error("ERROR FROM data/utils/getHMembersFromSet", e)
    }
  })

  try {
    const docs = await Promise.all(reads)
    return filter(docs, isTruthy)
  } catch (e) {
    console.error("ERROR FROM data/utils/getHMembersFromSet", e)
    return []
  }
}

type DeleteMembersFromSetParams = {
  context: AppContext
  setKey: string
  recordPrefix: string
}

// Deletes keys from Redis that are indexed in a set elsewhere
export async function deleteMembersFromSet({
  context,
  setKey,
  recordPrefix,
}: DeleteMembersFromSetParams) {
  const members = await context.redis.pubClient.sMembers(setKey)
  const dels = members.map(async (key) => {
    return context.redis.pubClient.unlink(`${recordPrefix}:${key}`)
  })
  await dels
  return null
}

export function mapUserBooleans(user: StoredUser) {
  return {
    ...user,
    isDj: user.isDj === "true",
    isDeputyDj: user.isDeputyDj === "true",
    isAdmin: user.isAdmin === "true",
  }
}

type GetTtlParams = {
  context: AppContext
  key: string
}

export function getTtl({ context, key }: GetTtlParams) {
  return context.redis.pubClient.ttl(key)
}

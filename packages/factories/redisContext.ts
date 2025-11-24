import { Factory } from "fishery"
import { RedisContext, RedisClientType } from "@repo/types"

const redisMethods = {
  connect: () => Promise.resolve(),
  disconnect: () => Promise.resolve(),
  quit: () => Promise.resolve(),
  get: () => Promise.resolve(),
  set: () => Promise.resolve(),
  del: () => Promise.resolve(),
  exists: () => Promise.resolve(),
  hGet: () => Promise.resolve(),
  hSet: () => Promise.resolve(),
  hGetAll: () => Promise.resolve(),
  hDel: () => Promise.resolve(),
  sAdd: () => Promise.resolve(),
  sRem: () => Promise.resolve(),
  sMembers: () => Promise.resolve(),
  publish: () => Promise.resolve(),
  subscribe: () => Promise.resolve(),
  unsubscribe: () => Promise.resolve(),
  pSubscribe: () => Promise.resolve(),
  pUnsubscribe: () => Promise.resolve(),
}

export const redisContextFactory = Factory.define<RedisContext>(({ sequence }) => ({
  pubClient: redisClientFactory.build(),
  subClient: redisClientFactory.build(),
}))

export const redisClientFactory = Factory.define<RedisClientType<any, any, any>>(
  ({ sequence }) => redisMethods as unknown as RedisClientType<any, any, any>,
)

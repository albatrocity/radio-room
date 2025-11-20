import { Factory } from "fishery"
import { AppContext } from "@repo/types"
import { redisContextFactory } from "./redisContext"

export const appContextFactory = Factory.define<AppContext>(({ sequence }) => {
  const redisContext = redisContextFactory.build()

  return {
    redis: redisContext,
    adapters: {
      playbackControllers: new Map(),
      metadataSources: new Map(),
      mediaSources: new Map(),
      serviceAuth: new Map(),
    },
    jobs: [],
  }
})

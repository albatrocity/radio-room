import {
  CreateServerConfig,
  PlaybackController,
  PlaybackControllerAuthentication,
  PlaybackControllerAdapter,
} from "@repo/types"

function createServer(config: CreateServerConfig) {}

export async function createController({
  adapter,
  authentication,
  name,
}: {
  adapter: PlaybackControllerAdapter
  authentication: PlaybackControllerAuthentication
  name: string
}): Promise<PlaybackController> {
  return await adapter.register({
    authentication,
    name,
  })
}

import type { AppContext } from "@repo/types"
import type { Server } from "socket.io"

/** Plugin name and room copied onto each capability (ADR 0201). */
export interface PluginCapabilityHost {
  readonly context: AppContext
  readonly io: Server
  readonly pluginName: string | null
  readonly roomId: string | null
}

/** Shared scope for capability APIs. Reads the host live so `forPlugin` binding applies. */
export abstract class PluginCapability {
  constructor(protected readonly host: PluginCapabilityHost) {}

  protected get context(): AppContext {
    return this.host.context
  }

  protected get io(): Server {
    return this.host.io
  }

  protected get pluginName(): string | null {
    return this.host.pluginName
  }

  protected get roomId(): string | null {
    return this.host.roomId
  }
}

import { io, type Socket } from "socket.io-client"
import {
  bridgeRequestSchema,
  type BridgeEvent,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeControlMessage,
} from "@repo/adapter-bridge/protocol"

const TOKEN_WAIT_MS = 10_000

export type DeviceClientOptions = {
  apiBaseUrl: string
  daemonId: string
  getSecret: () => string
  getToken: () => string | undefined
  onToken: (token: string, roomId: string) => void
  onLink: (message: unknown) => void
}

/**
 * Socket.IO client for the API `/device` namespace.
 * Standby auth is the pack secret. After link, the API returns a device token.
 */
export class DeviceClient {
  private socket: Socket | null = null
  private requestHandler: ((req: BridgeRequest) => void) | null = null
  private spotifyWaiters: Array<{
    resolve: (token: string) => void
    reject: (err: Error) => void
    timer: NodeJS.Timeout
  }> = []

  constructor(private readonly options: DeviceClientOptions) {}

  start(): void {
    if (this.socket) return
    const base = this.options.apiBaseUrl.replace(/\/$/, "")
    const socket = io(`${base}/device`, {
      auth: (cb) => {
        cb({
          daemonId: this.options.daemonId,
          secret: this.options.getSecret(),
          token: this.options.getToken() ?? "",
        })
      },
      reconnection: true,
      transports: ["websocket", "polling"],
    })
    this.socket = socket
    socket.on("connect", () => console.log(`[device] connected ${base}/device`))
    socket.on("connect_error", (err) => console.warn(`[device] connect error: ${err.message}`))
    socket.on("request", (payload: unknown) => {
      const parsed = bridgeRequestSchema.safeParse(payload)
      if (!parsed.success) return
      this.requestHandler?.(parsed.data)
    })
    socket.on("link", (payload: unknown) => {
      this.options.onLink(payload)
    })
    socket.on("device-token", (payload: unknown) => {
      if (!payload || typeof payload !== "object") return
      const token = (payload as { token?: unknown }).token
      const roomId = (payload as { roomId?: unknown }).roomId
      if (typeof token === "string" && token && typeof roomId === "string" && roomId) {
        this.options.onToken(token, roomId)
      }
    })
    socket.on("spotify-token", (payload: unknown) => {
      const accessToken =
        payload && typeof payload === "object"
          ? (payload as { accessToken?: unknown }).accessToken
          : undefined
      if (typeof accessToken !== "string" || !accessToken) return
      const waiters = this.spotifyWaiters.splice(0)
      for (const waiter of waiters) {
        clearTimeout(waiter.timer)
        waiter.resolve(accessToken)
      }
    })
  }

  stop(): void {
    for (const waiter of this.spotifyWaiters) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error("device socket stopped"))
    }
    this.spotifyWaiters = []
    this.socket?.disconnect()
    this.socket = null
  }

  setRequestHandler(handler: ((req: BridgeRequest) => void) | null): void {
    this.requestHandler = handler
  }

  bindRequests(handler: (req: BridgeRequest) => void): () => void {
    this.requestHandler = handler
    return () => {
      if (this.requestHandler === handler) this.requestHandler = null
    }
  }

  emitResponse(response: BridgeResponse): void {
    this.socket?.emit("response", response)
  }

  emitEvent(event: BridgeEvent): void {
    this.socket?.emit("event", event)
  }

  emitLink(message: BridgeControlMessage): void {
    this.socket?.emit("link", message)
  }

  join(roomId: string): void {
    this.socket?.emit("join", { roomId })
  }

  advertiseDeviceId(deviceId: string | null): void {
    this.socket?.emit("spotify-device", { deviceId })
  }

  requestAccessToken(): Promise<string> {
    this.emitEvent({ type: "TOKEN_REQUEST", service: "spotify" })
    console.log("[device] TOKEN_REQUEST")
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.spotifyWaiters = this.spotifyWaiters.filter((waiter) => waiter.timer !== timer)
        reject(new Error("Spotify access token not available (TOKEN_REQUEST timed out)"))
      }, TOKEN_WAIT_MS)
      this.spotifyWaiters.push({ resolve, reject, timer })
    })
  }
}

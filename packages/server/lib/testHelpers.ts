import { Server, Socket } from "socket.io"
import { vi } from "vitest"

type Options = {
  roomId?: string
  id?: string
  userId?: string
  username?: string
}

export function makeSocket({ roomId = "room123", id, ...rest }: Options = {}) {
  const saveSession = vi.fn()
  const destroySession = vi.fn()
  const emit = vi.fn()
  const toEmit = vi.fn()
  const broadcastEmit = vi.fn()
  const toBroadcast = vi.fn(() => ({
    emit: broadcastEmit,
  }))
  const to = vi.fn(() => ({
    emit: toEmit,
  }))
  const join = vi.fn()
  const leave = vi.fn()
  ;(Server.prototype as any).to = to

  const makeSocket = vi.fn(() => ({
    id,
    data: {
      roomId,
      ...rest,
    },
    broadcast: {
      emit: broadcastEmit,
      to: toBroadcast,
    },
    emit,
    join,
    leave,
    request: {
      session: {
        save: saveSession,
        destroy: destroySession,
      },
    },
  }))

  const makeIo = vi.fn(() => ({
    data: {
      roomId: "room123",
    },
    broadcast: {
      emit: broadcastEmit,
    },
    to, // ensure the mock instance also has the correct to
    sockets: {
      sockets: {
        get: vi.fn(),
      },
    },
    emit,
  }))
  const socket = makeSocket() as unknown as Socket
  const io = makeIo() as unknown as Server

  // Proxy to ensure all io.to() calls return { emit: toEmit }
  const ioProxy = new Proxy(io, {
    get(target, prop) {
      if (prop === "to") {
        return () => ({ emit: toEmit })
      }
      return Reflect.get(target, prop)
    },
  })

  return {
    emit,
    broadcastEmit,
    socket,
    io: ioProxy,
    toEmit,
    toBroadcast,
    to,
    join,
    leave,
    saveSession,
    destroySession,
  }
}

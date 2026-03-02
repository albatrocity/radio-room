import { vi } from "vitest"
import type { Server, Socket } from "socket.io"
import type { Mock } from "vitest"

type Options = {
  roomId?: string
  id?: string
  userId?: string
  username?: string
}

export function makeSocket({ roomId = "room123", id, ...rest }: Options = {}) {
  // Mocks for methods you want to assert
  const emit = vi.fn()
  const toEmit = vi.fn()
  const broadcastEmit = vi.fn()
  const toBroadcast = vi.fn(() => ({ emit: broadcastEmit }))
  const to = vi.fn((room) => {
    // Always return an object with an emit method, even if room is undefined
    return { emit: toEmit }
  })
  const join = vi.fn()
  const leave = vi.fn()
  const saveSession = vi.fn()
  const destroySession = vi.fn()

  // Mocked Socket
  const socket = {
    id,
    data: { roomId, ...rest },
    emit,
    join,
    leave,
    request: {
      session: {
        save: saveSession,
        destroy: destroySession,
      },
    },
    broadcast: {
      emit: broadcastEmit,
      to: toBroadcast,
    },
    context: {
      pluginRegistry: {
        emit: vi.fn(),
        syncRoomPlugins: vi.fn(),
      },
      systemEvents: {
        emit: vi.fn(),
      },
      redis: {
        client: {},
        sub: {},
        pub: {},
      },
      adapters: {
        playbackControllers: new Map(),
        metadataSources: new Map(),
        mediaSources: new Map(),
        serviceAuth: new Map(),
        playbackControllerModules: new Map(),
        metadataSourceModules: new Map(),
        mediaSourceModules: new Map(),
      },
      jobs: [],
    },
  } as unknown as Socket

  // Ensure roomId is always set on socket.data
  if (!socket.data.roomId) {
    socket.data.roomId = roomId
  }

  // Mocked Server (io)
  const io = {
    emit,
    to, // use the same 'to' mock defined above
    broadcast: {
      emit: broadcastEmit,
    },
    sockets: {
      sockets: {
        get: vi.fn(),
      },
    },
    data: { roomId: "room123" },
  } as unknown as Server

  return {
    socket,
    io,
    emit,
    toEmit,
    broadcastEmit,
    toBroadcast,
    to,
    join,
    leave,
    saveSession,
    destroySession,
  }
}

/**
 * Returns a socket mock with all broadcast.to and broadcast.emit methods fully mocked for assertion in tests.
 * Usage: const { socket, broadcastEmit, toBroadcast, roomSpy } = makeSocketWithBroadcastMocks({ roomId: "room1" })
 */
export function makeSocketWithBroadcastMocks(options: Options = {}): {
  socket: Socket
  io: Server
  emit: Mock
  toEmit: Mock
  broadcastEmit: Mock
  toBroadcast: Mock
  to: Mock
  join: Mock
  leave: Mock
  saveSession: Mock
  destroySession: Mock
  roomSpy: Mock
} {
  const base = makeSocket(options)
  const { socket, ...rest } = base

  // Spy for room argument
  const roomSpy = vi.fn()

  // Create a broadcaster object with emit method that works
  const broadcastEmit = rest.broadcastEmit
  const broadcaster = {
    emit: broadcastEmit,
    adapter: undefined,
    rooms: new Set(),
    exceptRooms: new Set(),
    flags: {},
    except: () => broadcaster,
    compress: () => broadcaster,
    volatile: () => broadcaster,
    local: () => broadcaster,
    timeout: () => broadcaster,
  }

  // Patch socket.broadcast.to to return the broadcaster
  const toBroadcast = vi.fn((room) => {
    roomSpy(room)
    return broadcaster
  })

  socket.broadcast.to = toBroadcast as any

  // Patch io.to to always return a simple emitter object
  const toEmit = base.toEmit
  const io = base.io

  // Create a direct function mock that returns an object with emit
  const ioEmitter = {
    emit: toEmit,
    adapter: undefined,
    rooms: new Set(),
    exceptRooms: new Set(),
    flags: {},
    except: () => ioEmitter,
    compress: () => ioEmitter,
    volatile: () => ioEmitter,
    local: () => ioEmitter,
    timeout: () => ioEmitter,
  }

  const toFn = vi.fn((room) => {
    roomSpy(room)
    return ioEmitter
  })

  // Replace io.to with the mock function that will survive type casting
  // Use Object.defineProperty to make it non-enumerable and non-configurable
  Object.defineProperty(io, "to", {
    value: toFn,
    writable: false,
    configurable: false,
  })
  // Patch io in the returned object
  return {
    ...base,
    socket,
    io,
    broadcastEmit,
    toBroadcast,
    toEmit,
    roomSpy,
  }
}

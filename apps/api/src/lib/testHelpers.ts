import { Server, Socket } from "socket.io";

type Options = {
  roomId?: string;
  id?: string;
  userId?: string;
  username?: string;
};

export function makeSocket({ roomId = "room123", id, ...rest }: Options = {}) {
  const saveSession = jest.fn();
  const destroySession = jest.fn();
  const emit = jest.fn();
  const toEmit = jest.fn();
  const broadcastEmit = jest.fn();
  const toBroadcast = jest.fn(() => ({
    emit: broadcastEmit,
  }));
  const to = jest.fn(() => ({
    emit: toEmit,
  }));
  const join = jest.fn();
  const leave = jest.fn();
  const makeSocket = jest.fn(() => ({
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
  }));

  const makeIo = jest.fn(() => ({
    data: {
      roomId: "room123",
    },
    broadcast: {
      emit: broadcastEmit,
    },
    to,
    sockets: {
      sockets: {
        get: jest.fn(),
      },
    },
    emit,
  }));
  const socket = makeSocket() as unknown as Socket;
  const io = makeIo() as unknown as Server;
  return {
    emit,
    broadcastEmit,
    socket,
    io,
    toEmit,
    toBroadcast,
    to,
    join,
    leave,
    saveSession,
    destroySession,
  };
}

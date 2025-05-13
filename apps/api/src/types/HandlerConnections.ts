import { Server, Socket } from "socket.io";

export type HandlerConnections = { socket: Socket; io: Server };

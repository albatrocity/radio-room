import { Server } from "socket.io";

export type PubSubHandlerArgs = {
  io: Server;
  message: string;
  channel: string;
};

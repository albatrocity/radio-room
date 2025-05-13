import { Server } from "socket.io";
import jukeboxHandlers from "./jukebox";
import errorHandlers from "./errors";
import roomHandlers from "./rooms";

export function bindPubSubHandlers(io: Server) {
  jukeboxHandlers(io);
  errorHandlers(io);
  roomHandlers(io);
}

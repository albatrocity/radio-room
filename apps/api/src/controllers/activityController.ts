import { Emoji } from "../types/Emoji";
import { Server, Socket } from "socket.io";

import {
  addReaction,
  removeReaction,
  startListening,
  stopListening,
} from "../handlers/activityHandlers";
import { ReactionSubject } from "../types/ReactionSubject";
import { User } from "../types/User";

export default function activityController(socket: Socket, io: Server) {
  socket.on("start listening", () => {
    console.log("START LISTENING SOCKET EVENT");
    startListening({ socket, io });
  });

  socket.on("stop listening", () => {
    console.log("STOP LISTENING SOCKET EVENT");
    stopListening({ socket, io });
  });

  socket.on(
    "add reaction",
    ({
      emoji,
      reactTo,
      user,
    }: {
      emoji: Emoji;
      reactTo: ReactionSubject;
      user: User;
    }) => {
      return addReaction({ socket, io }, { emoji, reactTo, user });
    }
  );

  socket.on(
    "remove reaction",
    ({
      emoji,
      reactTo,
      user,
    }: {
      emoji: Emoji;
      reactTo: ReactionSubject;
      user: User;
    }) => {
      return removeReaction({ socket, io }, { emoji, reactTo, user });
    }
  );
}

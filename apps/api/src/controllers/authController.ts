import { Server, Socket } from "socket.io";
import { User } from "../types/User";

import {
  changeUsername,
  checkPassword,
  disconnect,
  login,
  getUserSpotifyAuth,
  submitPassword,
  logoutSpotifyAuth,
  nukeUser,
} from "../handlers/authHandlers";
import { Request, Response } from "express";
import { disconnectFromSpotify, getUser } from "../operations/data";

export default function authController(socket: Socket, io: Server) {
  socket.on("check password", (submittedPassword: string) =>
    checkPassword({ socket, io }, submittedPassword)
  );

  socket.on("submit password", (submittedPassword: string) =>
    submitPassword({ socket, io }, submittedPassword)
  );

  socket.on(
    "login",
    ({
      username,
      userId,
      password,
      roomId,
    }: {
      username: User["username"];
      userId: User["userId"];
      password?: string;
      roomId: string;
    }) => {
      login({ socket, io }, { username, userId, password, roomId });
    }
  );

  socket.on(
    "change username",
    ({
      username,
      userId,
    }: {
      username: User["username"];
      userId: User["userId"];
    }) => changeUsername({ socket, io }, { username, userId })
  );

  socket.on("get user spotify authentication status", ({ userId }) => {
    getUserSpotifyAuth({ socket, io }, { userId });
  });
  socket.on("logout spotify", (args: { userId?: string } = {}) => {
    const options = args ? { userId: args.userId } : { userId: "app" };
    logoutSpotifyAuth({ socket, io }, options);
  });
  socket.on("nuke user", (args: { userId?: string } = {}) => {
    nukeUser({ socket, io });
  });

  socket.on("disconnect", () => disconnect({ socket, io }));
  socket.on("user left", () => {
    disconnect({ socket, io });
  });
}

export async function logout(req: Request, res: Response) {
  if (req.session.user?.userId) {
    await disconnectFromSpotify(req.session.user.userId);
    req.session.destroy((err) => {
      if (err) {
        console.log("ERROR FROM authController/logout", err);
        res.status(500).send("Error logging out");
      } else {
        res.clearCookie("connect.sid");
        res.status(200).send("Logged out");
      }
    });
  }
}

export async function me(req: Request, res: Response) {
  const { user } = req.session;
  if (user) {
    const u = await getUser(user.userId);
    res.status(200).send({
      user: u,
      isNewUser: !user.userId,
    });
  } else {
    res.status(401).send({ message: "Not logged in" });
  }
}

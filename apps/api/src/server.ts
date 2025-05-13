import { execa } from "execa";
import { createAdapter } from "@socket.io/redis-adapter";
import cookieParser from "cookie-parser";
import session from "express-session";
import RedisStore from "connect-redis";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { User } from "./types/User";

import { pubClient, subClient } from "./lib/redisClients";
import { bindPubSubHandlers } from "./pubSub/handlers";
import { callback, login } from "./controllers/spotifyAuthController";
import roomsController, {
  create,
  deleteRoom,
  findRoom,
  findRooms,
} from "./controllers/roomsController";

import activityController from "./controllers/activityController";
import adminController from "./controllers/adminController";
import authController, { me, logout } from "./controllers/authController";
import djController from "./controllers/djController";
import messageController from "./controllers/messageController";
import { clearRoomOnlineUsers } from "./operations/data";
import getStation from "./operations/getStation";

declare module "express-session" {
  interface Session {
    user?: User;
    roomId?: string;
  }
}

const PORT = Number(process.env.PORT ?? 3000);

const redisStore = new RedisStore({ client: pubClient, prefix: "s:" });

const sessionMiddleware = session({
  store: redisStore,
  resave: true, // required: force lightweight session keep alive (touch)
  saveUninitialized: false, // recommended: only save session when data exists
  proxy: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    domain:
      process.env.NODE_ENV === "production"
        ? ".listeningroom.club"
        : "localhost",
    path: "/",
  },
  secret: process.env.SESSION_SECRET ?? "secret",
});

const httpServer = express()
  .set("trust proxy", 1)
  .use(express.static(__dirname + "/public"))
  .use(
    cors({
      origin: [
        "http://localhost:8000",
        "https://listen.show",
        "https://www.listen.show",
        "https://listeningroom.club",
        "https://www.listeningroom.club",
      ],
      preflightContinue: true,
      credentials: true,
    })
  )
  .use(express.json())
  .use(cookieParser())
  .use(sessionMiddleware)
  .get("/me", me)
  .get("/rooms/", findRooms)
  .get("/rooms/:id", findRoom)
  .post("/rooms", create)
  .delete("/rooms/:id", deleteRoom)
  .get("/login", login)
  .post("/logout", logout)
  .get("/callback", callback)
  .listen(PORT, "0.0.0.0", () => console.log(`Listening on ${PORT}`));

const io = new Server(httpServer, {
  connectTimeout: 45000,
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: false,
});

pubClient.connect();
subClient.connect();

io.adapter(createAdapter(pubClient, subClient));
io.use((socket, next) => {
  /** @ts-ignore */
  sessionMiddleware(socket.request, socket.request.res || {}, next);
  // sessionMiddleware(socket.request, socket.request.res, next); will not work with websocket-only
  // connections, as 'socket.request.res' will be undefined in that case
});

io.on("connection", (socket) => {
  authController(socket, io);
  messageController(socket, io);
  activityController(socket, io);
  djController(socket, io);
  adminController(socket, io);
  roomsController(socket, io);
});

// pubsub events
bindPubSubHandlers(io);

async function startJobs() {
  try {
    // @ts-ignore
    await execa("node", ["dist/jobs/processor.js"]).pipeStdout(process.stdout);
  } catch (e) {
    console.error(e);
  }
}
async function boot() {
  const roomIds = await pubClient.sMembers("rooms");
  await Promise.all(
    roomIds.map(async (id) => {
      return clearRoomOnlineUsers(id);
    })
  );
}

startJobs();

boot();

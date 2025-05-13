import { PUBSUB_USER_JOINED } from "../../lib/constants";
import getRoomPath from "../../lib/getRoomPath";
import { pubClient } from "../../lib/redisClients";
import { HandlerConnections } from "../../types/HandlerConnections";
import { Room } from "../../types/Room";
import { User } from "../../types/User";

type UsersData = {
  users: User[];
  user?: User;
};

export async function pubUserJoined(
  { io }: Pick<HandlerConnections, "io">,
  roomId: Room["id"],
  data: UsersData
) {
  io.to(getRoomPath(roomId)).emit("event", {
    type: "USER_JOINED",
    data: data,
  });
  pubClient.publish(PUBSUB_USER_JOINED, JSON.stringify({ roomId, data: data }));
}

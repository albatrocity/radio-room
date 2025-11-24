import { findRoom } from "../operations/data";

export default async function getAdminUserId(roomId: string) {
  const room = await findRoom(roomId);
  return room?.creator;
}

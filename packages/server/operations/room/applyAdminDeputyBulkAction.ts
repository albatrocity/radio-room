import type { AppContext, DeputyBulkAction } from "@repo/types"
import { findRoom, isRoomAdmin } from "../data"
import { applySegmentDeputyBulkAction } from "./applySegmentDeputyBulkAction"

type ErrorBody = { status: number; error: string; message: string }

/**
 * Admin-triggered bulk deputy update. Same membership and event behavior as a
 * segment `deputyBulkAction`, gated on room admin.
 */
export async function applyAdminDeputyBulkAction(params: {
  context: AppContext
  roomId: string
  userId: string
  action: DeputyBulkAction | undefined
}): Promise<{ ok: true } | { ok: false; error: ErrorBody }> {
  const { context, roomId, userId, action } = params

  if (action !== "deputize_all" && action !== "dedeputize_all") {
    return {
      ok: false,
      error: { status: 400, error: "Bad Request", message: "Invalid deputy bulk action." },
    }
  }

  const room = await findRoom({ context, roomId })
  if (!room) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Room not found." } }
  }

  const isAdmin = await isRoomAdmin({ context, roomId, userId, roomCreator: room.creator })
  if (!isAdmin) {
    return {
      ok: false,
      error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
    }
  }

  await applySegmentDeputyBulkAction({ context, roomId, action })
  return { ok: true }
}

import type { Request } from "express"
import { fromNodeHeaders } from "better-auth/node"
import { auth } from "./server"

/** Better Auth session when the request is authenticated as a platform admin; otherwise null. */
export async function getPlatformAdminSession(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (session?.user.role === "admin") return session
    return null
  } catch {
    return null
  }
}

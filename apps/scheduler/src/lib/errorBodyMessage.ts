import { HTTPError } from "ky"

/** Prefer the API's `{ error }` body over ky's generic status message. */
export async function errorBodyMessage(e: unknown): Promise<string> {
  if (e instanceof HTTPError) {
    try {
      const body = (await e.response.json()) as { error?: string }
      if (body.error) return body.error
    } catch {
      /* ignore */
    }
    return e.message
  }
  if (e instanceof Error) return e.message
  return "Request failed"
}

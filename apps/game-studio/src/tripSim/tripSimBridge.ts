import type { TripSimSnapshot } from "@repo/plugin-road-trip/sim"

let warned = false

/**
 * Post the trip simulator's state to studio-bridge (`POST /trip-sim`, ADR 0213).
 * `null` clears it, so the room falls back to the sandbox (or the fixture).
 */
export async function postTripSim(
  baseUrl: string,
  roomId: string,
  snapshot: TripSimSnapshot | null,
): Promise<void> {
  try {
    await fetch(`${baseUrl.replace(/\/$/, "")}/trip-sim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, snapshot }),
    })
  } catch (error) {
    if (!warned) {
      warned = true
      console.warn("[game-studio] trip sim publish failed (is `make game-studio` running?)", error)
    }
  }
}

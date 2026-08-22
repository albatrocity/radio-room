/**
 * Spotify's Web API is called from 1s cron jobs. The SDK defaults to bare `fetch`,
 * which has no timeout, so a single hung request can stall a job for far longer than
 * its interval and starve every later tick.
 */
export const SPOTIFY_REQUEST_TIMEOUT_MS = 10_000

/**
 * `fetch` that aborts rather than hanging. A caller-supplied signal is combined with
 * the timeout rather than replacing it, so passing one cannot reintroduce a hang.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = SPOTIFY_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs)
  return fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  })
}

/** Spread into `SpotifyApi.withAccessToken` so SDK requests cannot hang. */
export const spotifySdkConfig = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetchWithTimeout(input, init),
}

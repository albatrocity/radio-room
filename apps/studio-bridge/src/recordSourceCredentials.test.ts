import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { loadSpotifyCredentials, navidromeConfig } from "./recordSourceCredentials"

const dir = mkdtempSync(join(tmpdir(), "record-creds-"))
const rootEnv = join(dir, ".env")
writeFileSync(rootEnv, "PORT=3000\nSPOTIFY_CLIENT_ID=root-id\nSPOTIFY_CLIENT_SECRET=root-secret\n")
const daemonConfig = join(dir, "config.json")
writeFileSync(
  daemonConfig,
  JSON.stringify({ navidrome: { url: "http://nd:4533/", username: "dj", password: "pw" } }),
)

describe("loadSpotifyCredentials", () => {
  it("takes only the Spotify keys from the root .env", () => {
    const env: NodeJS.ProcessEnv = {}
    loadSpotifyCredentials(rootEnv, env)
    expect(env).toEqual({ SPOTIFY_CLIENT_ID: "root-id", SPOTIFY_CLIENT_SECRET: "root-secret" })
  })

  it("keeps keys already set and tolerates a missing file", () => {
    const env: NodeJS.ProcessEnv = { SPOTIFY_CLIENT_ID: "mine", SPOTIFY_CLIENT_SECRET: "s" }
    loadSpotifyCredentials(rootEnv, env)
    expect(env.SPOTIFY_CLIENT_ID).toBe("mine")
    const empty: NodeJS.ProcessEnv = {}
    loadSpotifyCredentials(join(dir, "missing.env"), empty)
    expect(empty).toEqual({})
  })
})

describe("navidromeConfig", () => {
  it("prefers the env, then the daemon config", () => {
    const env = { NAVIDROME_URL: "http://env", NAVIDROME_USER: "u", NAVIDROME_PASSWORD: "p" }
    expect(navidromeConfig(env, daemonConfig)).toEqual({ url: "http://env", user: "u", password: "p" })
    expect(navidromeConfig({}, daemonConfig)).toEqual({
      url: "http://nd:4533",
      user: "dj",
      password: "pw",
    })
  })

  it("is null without a complete login", () => {
    expect(navidromeConfig({}, join(dir, "missing.json"))).toBeNull()
  })
})

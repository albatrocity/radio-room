import { describe, expect, it } from "vitest"
import {
  isLanApiHostname,
  resolveBrowserApiBaseUrl,
} from "./resolveBrowserApiBaseUrl"

const CONFIGURED = "https://api.listeningroom.club"

describe("isLanApiHostname", () => {
  it("treats mDNS and private IPs as LAN", () => {
    expect(isLanApiHostname("ross.local")).toBe(true)
    expect(isLanApiHostname("10.0.0.5")).toBe(true)
    expect(isLanApiHostname("192.168.1.10")).toBe(true)
    expect(isLanApiHostname("172.16.0.1")).toBe(true)
    expect(isLanApiHostname("172.31.255.1")).toBe(true)
    expect(isLanApiHostname("fd12:3456::1")).toBe(true)
    expect(isLanApiHostname("[fe80::1]")).toBe(true)
  })

  it("does not treat loopback or public hosts as LAN", () => {
    expect(isLanApiHostname("localhost")).toBe(false)
    expect(isLanApiHostname("127.0.0.1")).toBe(false)
    expect(isLanApiHostname("8.8.8.8")).toBe(false)
    expect(isLanApiHostname("172.15.0.1")).toBe(false)
    expect(isLanApiHostname("scheduler.listeningroom.club")).toBe(false)
    expect(isLanApiHostname("www.listeningroom.club")).toBe(false)
    expect(isLanApiHostname("listen.show")).toBe(false)
  })
})

describe("resolveBrowserApiBaseUrl", () => {
  it("strips a trailing slash and uses configured when location is missing", () => {
    expect(resolveBrowserApiBaseUrl(`${CONFIGURED}/`)).toBe(CONFIGURED)
    expect(resolveBrowserApiBaseUrl(`${CONFIGURED}/`, null)).toBe(CONFIGURED)
  })

  it("keeps VITE_API_URL on loopback", () => {
    expect(
      resolveBrowserApiBaseUrl(CONFIGURED, { hostname: "localhost", protocol: "http:" }),
    ).toBe(CONFIGURED)
    expect(
      resolveBrowserApiBaseUrl(CONFIGURED, { hostname: "127.0.0.1", protocol: "http:" }),
    ).toBe(CONFIGURED)
    expect(
      resolveBrowserApiBaseUrl(CONFIGURED, { hostname: "[::1]", protocol: "http:" }),
    ).toBe(CONFIGURED)
  })

  it("rewrites LAN hosts to the same hostname on port 3000", () => {
    expect(
      resolveBrowserApiBaseUrl(CONFIGURED, { hostname: "ross.local", protocol: "http:" }),
    ).toBe("http://ross.local:3000")
    expect(
      resolveBrowserApiBaseUrl(CONFIGURED, {
        hostname: "192.168.1.10",
        protocol: "http:",
      }),
    ).toBe("http://192.168.1.10:3000")
  })

  it("keeps VITE_API_URL on production public hosts", () => {
    expect(
      resolveBrowserApiBaseUrl(CONFIGURED, {
        hostname: "scheduler.listeningroom.club",
        protocol: "https:",
      }),
    ).toBe(CONFIGURED)
    expect(
      resolveBrowserApiBaseUrl(CONFIGURED, {
        hostname: "www.listeningroom.club",
        protocol: "https:",
      }),
    ).toBe(CONFIGURED)
    expect(
      resolveBrowserApiBaseUrl(CONFIGURED, {
        hostname: "listeningroom.club",
        protocol: "https:",
      }),
    ).toBe(CONFIGURED)
  })

  it("does not invent a :3000 origin when configured is empty on a public host", () => {
    expect(
      resolveBrowserApiBaseUrl("", {
        hostname: "scheduler.listeningroom.club",
        protocol: "https:",
      }),
    ).toBe("")
  })
})

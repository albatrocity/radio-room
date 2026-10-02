import type { IncomingMessage } from "node:http"
import { describe, expect, it } from "vitest"
import { rejectStudioRequest } from "./studioRequestGuard"

function request(opts: {
  address?: string
  headers?: Record<string, string>
}): IncomingMessage {
  return {
    socket: { remoteAddress: opts.address ?? "127.0.0.1" },
    headers: {
      host: "localhost:8005",
      "x-studio-request": "1",
      ...opts.headers,
    },
  } as unknown as IncomingMessage
}

describe("rejectStudioRequest (ADR 0205)", () => {
  it("allows the studio page on this machine", () => {
    expect(rejectStudioRequest(request({}))).toBeNull()
    expect(
      rejectStudioRequest(request({ headers: { origin: "http://localhost:8005" } })),
    ).toBeNull()
    expect(
      rejectStudioRequest(
        request({ address: "::1", headers: { host: "[::1]:8005", origin: "http://[::1]:8005" } }),
      ),
    ).toBeNull()
  })

  it("refuses other machines on the network (the dev server binds 0.0.0.0)", () => {
    expect(rejectStudioRequest(request({ address: "192.168.1.20" }))?.status).toBe(403)
  })

  it("refuses requests without the studio header (cross-site simple POSTs)", () => {
    const req = request({})
    delete req.headers["x-studio-request"]
    expect(rejectStudioRequest(req)?.status).toBe(403)
  })

  it("refuses cross-origin and DNS-rebinding hosts", () => {
    expect(
      rejectStudioRequest(request({ headers: { origin: "https://evil.example" } }))?.status,
    ).toBe(403)
    expect(
      rejectStudioRequest(
        request({ headers: { host: "rebind.evil.example:8005", origin: "http://rebind.evil.example:8005" } }),
      )?.status,
    ).toBe(403)
  })
})

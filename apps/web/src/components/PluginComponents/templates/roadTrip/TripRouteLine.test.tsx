import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { ChakraProvider } from "@chakra-ui/react"
import { renderToStaticMarkup } from "react-dom/server"
import type { TripStore } from "@repo/road-trip-map"
import { system } from "../../../../theme/chakraTheme"
import type { VanMotion } from "./useRoadTripVanMotion"
import { TripRouteLine } from "./TripRouteLine"

vi.hoisted(() => {
  const store = new Map<string, string>()
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  })
})

function render(ui: ReactElement) {
  return renderToStaticMarkup(<ChakraProvider value={system}>{ui}</ChakraProvider>)
}

const trip = { routeMiles: 100, sites: [] } as unknown as TripStore

function motion(partial: Partial<VanMotion> = {}): VanMotion {
  return { phase: "cruising", flourish: null, flourishId: 0, ...partial }
}

function van(html: string): string {
  const match = html.match(/<div[^>]*data-road-trip-van[^>]*>/)
  return match?.[0] ?? ""
}

describe("TripRouteLine van gait", () => {
  it("chugs while cruising, with no exit heading", () => {
    const html = render(<TripRouteLine trip={trip} mile={20} motion={motion()} />)
    expect(html).toContain('data-van-gait="chug"')
    expect(van(html)).not.toContain("data-van-heading")
  })

  it("keeps the chug and yaws off the route while exiting", () => {
    const html = render(
      <TripRouteLine trip={trip} mile={20} motion={motion({ phase: "exiting" })} />,
    )
    expect(html).toContain('data-van-gait="chug"')
    expect(van(html)).toContain('data-van-heading="exit"')
  })

  it("lets a flourish replace the chug", () => {
    const html = render(
      <TripRouteLine
        trip={trip}
        mile={20}
        motion={motion({ phase: "cruising", flourish: "depart", flourishId: 2 })}
      />,
    )
    expect(html).not.toContain("data-van-gait")
    expect(van(html)).toContain('data-van-flourish="depart"')
  })

  it("sits still when parked", () => {
    const html = render(
      <TripRouteLine trip={trip} mile={20} motion={motion({ phase: "parked" })} />,
    )
    expect(html).not.toContain("data-van-gait")
    expect(van(html)).not.toContain("data-van-heading")
  })
})

// Mock Redis clients to avoid connection issues during tests
import { vi } from "vitest"

// Mock Redis clients
vi.mock("../lib/redisClients", () => ({
  pubClient: {
    get: vi.fn(),
    set: vi.fn(),
  },
  subClient: {
    subscribe: vi.fn(),
  },
}))

// Add any other global mocks here

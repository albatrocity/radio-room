// Mock Redis clients to avoid connection issues during tests
import { vi } from "vitest"

// Import-time guard in @repo/db — tests never connect with this placeholder
process.env.DATABASE_URL ??= "postgres://127.0.0.1:5432/postgres"

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

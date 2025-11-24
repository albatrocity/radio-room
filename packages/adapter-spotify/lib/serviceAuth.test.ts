import { describe, expect, test, vi, beforeEach } from "vitest"
import { createSpotifyServiceAuthAdapter } from "./serviceAuth"
import { AppContext } from "@repo/types"
import { appContextFactory } from "@repo/factories"
import * as serviceAuthOperations from "@repo/server/operations/data/serviceAuthentications"
import * as refreshOp from "./operations/refreshSpotifyAccessToken"

// Mock the service authentication operations
vi.mock("@repo/server/operations/data/serviceAuthentications", () => ({
  getUserServiceAuth: vi.fn(),
  deleteUserServiceAuth: vi.fn(),
  storeUserServiceAuth: vi.fn(),
}))

// Mock the Spotify token refresh operation
vi.mock("./operations/refreshSpotifyAccessToken", () => ({
  refreshSpotifyAccessToken: vi.fn(),
}))

describe("createSpotifyServiceAuthAdapter", () => {
  let mockContext: AppContext
  let spotifyAuthAdapter: ReturnType<typeof createSpotifyServiceAuthAdapter>

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Set up environment variables for tests
    process.env.SPOTIFY_CLIENT_ID = "test-client-id"
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret"
    
    // Mock refreshSpotifyAccessToken to return test data
    vi.mocked(refreshOp.refreshSpotifyAccessToken).mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresIn: 3600,
    })
    
    mockContext = appContextFactory.build()
    spotifyAuthAdapter = createSpotifyServiceAuthAdapter(mockContext)
  })

  describe("adapter properties", () => {
    test("should have serviceName set to 'spotify'", () => {
      expect(spotifyAuthAdapter.serviceName).toBe("spotify")
    })

    test("should have all required methods", () => {
      expect(typeof spotifyAuthAdapter.getAuthStatus).toBe("function")
      expect(typeof spotifyAuthAdapter.logout).toBe("function")
      expect(typeof spotifyAuthAdapter.refreshAuth).toBe("function")
    })
  })

  describe("getAuthStatus", () => {
    test("should return authenticated status when user has valid tokens", async () => {
      const mockAuth = {
        accessToken: "mock-access-token",
        refreshToken: "mock-refresh-token",
        expiresAt: Date.now() + 3600000,
      }

      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(mockAuth)

      const result = await spotifyAuthAdapter.getAuthStatus("user123")

      expect(result).toEqual({
        isAuthenticated: true,
        accessToken: "mock-access-token",
        serviceName: "spotify",
      })

      expect(serviceAuthOperations.getUserServiceAuth).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
        serviceName: "spotify",
      })
    })

    test("should return unauthenticated status when no tokens found", async () => {
      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(null)

      const result = await spotifyAuthAdapter.getAuthStatus("user123")

      expect(result).toEqual({
        isAuthenticated: false,
        accessToken: undefined,
        serviceName: "spotify",
      })
    })

    test("should return unauthenticated status when tokens have no accessToken", async () => {
      const mockAuth = {
        accessToken: "",
        refreshToken: "mock-refresh-token",
        expiresAt: Date.now() + 3600000,
      }

      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(mockAuth)

      const result = await spotifyAuthAdapter.getAuthStatus("user123")

      expect(result).toEqual({
        isAuthenticated: false,
        accessToken: "",
        serviceName: "spotify",
      })
    })

    test("should handle errors gracefully and return unauthenticated", async () => {
      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockRejectedValue(
        new Error("Redis connection failed"),
      )

      const result = await spotifyAuthAdapter.getAuthStatus("user123")

      expect(result).toEqual({
        isAuthenticated: false,
        serviceName: "spotify",
      })
    })

    test("should work with different user IDs", async () => {
      const mockAuth = {
        accessToken: "different-access-token",
        refreshToken: "different-refresh-token",
        expiresAt: Date.now() + 3600000,
      }

      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(mockAuth)

      const result = await spotifyAuthAdapter.getAuthStatus("user456")

      expect(serviceAuthOperations.getUserServiceAuth).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user456",
        serviceName: "spotify",
      })

      expect(result.isAuthenticated).toBe(true)
      expect(result.accessToken).toBe("different-access-token")
    })
  })

  describe("logout", () => {
    test("should call deleteUserServiceAuth with correct parameters", async () => {
      vi.mocked(serviceAuthOperations.deleteUserServiceAuth).mockResolvedValue()

      await spotifyAuthAdapter.logout("user123")

      expect(serviceAuthOperations.deleteUserServiceAuth).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
        serviceName: "spotify",
      })
    })

    test("should work with different user IDs", async () => {
      vi.mocked(serviceAuthOperations.deleteUserServiceAuth).mockResolvedValue()

      await spotifyAuthAdapter.logout("user789")

      expect(serviceAuthOperations.deleteUserServiceAuth).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user789",
        serviceName: "spotify",
      })
    })

    test("should not throw error when user has no auth to delete", async () => {
      vi.mocked(serviceAuthOperations.deleteUserServiceAuth).mockResolvedValue()

      await expect(spotifyAuthAdapter.logout("nonexistent-user")).resolves.not.toThrow()
    })

    test("should propagate errors from deleteUserServiceAuth", async () => {
      const error = new Error("Redis delete failed")
      vi.mocked(serviceAuthOperations.deleteUserServiceAuth).mockRejectedValue(error)

      await expect(spotifyAuthAdapter.logout("user123")).rejects.toThrow("Redis delete failed")
    })
  })

  describe("refreshAuth", () => {
    test("should refresh tokens and store them when refresh token is available", async () => {
      const mockAuth = {
        accessToken: "current-access-token",
        refreshToken: "current-refresh-token",
        expiresAt: Date.now() - 1000, // Expired
      }

      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(mockAuth)
      vi.mocked(serviceAuthOperations.storeUserServiceAuth).mockResolvedValue()

      const result = await spotifyAuthAdapter.refreshAuth("user123")

      // Should call Spotify API to refresh
      expect(refreshOp.refreshSpotifyAccessToken).toHaveBeenCalledWith(
        "current-refresh-token",
        "test-client-id",
        "test-client-secret",
      )

      // Should store the new tokens
      expect(serviceAuthOperations.storeUserServiceAuth).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
        serviceName: "spotify",
        tokens: {
          accessToken: "new-access-token",
          refreshToken: "new-refresh-token",
          expiresAt: expect.any(Number),
        },
      })

      // Should return the new tokens
      expect(result.accessToken).toBe("new-access-token")
      expect(result.refreshToken).toBe("new-refresh-token")
      expect(result.expiresAt).toBeGreaterThan(Date.now())
    })

    test("should throw error when no refresh token is available", async () => {
      const mockAuth = {
        accessToken: "access-token",
        refreshToken: "",
        expiresAt: Date.now() + 3600000,
      }

      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(mockAuth)

      await expect(spotifyAuthAdapter.refreshAuth("user123")).rejects.toThrow(
        "No refresh token available",
      )
    })

    test("should throw error when no auth data exists", async () => {
      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(null)

      await expect(spotifyAuthAdapter.refreshAuth("user123")).rejects.toThrow(
        "No refresh token available",
      )
    })

    test("should throw error when auth exists but tokens are undefined", async () => {
      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue({
        accessToken: "",
        refreshToken: "",
      })

      await expect(spotifyAuthAdapter.refreshAuth("user123")).rejects.toThrow(
        "No refresh token available",
      )
    })
  })

  describe("integration scenarios", () => {
    test("should handle complete auth lifecycle: login -> check status -> logout", async () => {
      const mockAuth = {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresAt: Date.now() + 3600000,
      }

      // After login (tokens stored)
      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(mockAuth)
      const statusAfterLogin = await spotifyAuthAdapter.getAuthStatus("user123")
      expect(statusAfterLogin.isAuthenticated).toBe(true)

      // Logout
      vi.mocked(serviceAuthOperations.deleteUserServiceAuth).mockResolvedValue()
      await spotifyAuthAdapter.logout("user123")

      // Check status after logout
      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(null)
      const statusAfterLogout = await spotifyAuthAdapter.getAuthStatus("user123")
      expect(statusAfterLogout.isAuthenticated).toBe(false)
    })

    test("should handle token refresh when tokens are expired", async () => {
      const expiredAuth = {
        accessToken: "expired-access-token",
        refreshToken: "valid-refresh-token",
        expiresAt: Date.now() - 1000,
      }

      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(expiredAuth)
      vi.mocked(serviceAuthOperations.storeUserServiceAuth).mockResolvedValue()

      // Refresh should call Spotify API and return new tokens
      const refreshedTokens = await spotifyAuthAdapter.refreshAuth("user123")

      expect(refreshOp.refreshSpotifyAccessToken).toHaveBeenCalledWith(
        "valid-refresh-token",
        "test-client-id",
        "test-client-secret",
      )

      expect(refreshedTokens.accessToken).toBe("new-access-token")
      expect(refreshedTokens.refreshToken).toBe("new-refresh-token")
      expect(refreshedTokens.expiresAt).toBeGreaterThan(Date.now())
    })
  })

  describe("edge cases", () => {
    test("should handle empty user ID", async () => {
      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(null)

      const result = await spotifyAuthAdapter.getAuthStatus("")

      expect(serviceAuthOperations.getUserServiceAuth).toHaveBeenCalledWith({
        context: mockContext,
        userId: "",
        serviceName: "spotify",
      })

      expect(result.isAuthenticated).toBe(false)
    })

    test("should handle special characters in user ID", async () => {
      const specialUserId = "user@email.com"
      const mockAuth = {
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiresAt: Date.now() + 3600000,
      }

      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(mockAuth)

      const result = await spotifyAuthAdapter.getAuthStatus(specialUserId)

      expect(serviceAuthOperations.getUserServiceAuth).toHaveBeenCalledWith({
        context: mockContext,
        userId: specialUserId,
        serviceName: "spotify",
      })

      expect(result.isAuthenticated).toBe(true)
    })

    test("should handle concurrent auth status checks", async () => {
      const mockAuth = {
        accessToken: "concurrent-token",
        refreshToken: "concurrent-refresh",
        expiresAt: Date.now() + 3600000,
      }

      vi.mocked(serviceAuthOperations.getUserServiceAuth).mockResolvedValue(mockAuth)

      // Make multiple concurrent calls
      const results = await Promise.all([
        spotifyAuthAdapter.getAuthStatus("user1"),
        spotifyAuthAdapter.getAuthStatus("user2"),
        spotifyAuthAdapter.getAuthStatus("user3"),
      ])

      expect(results).toHaveLength(3)
      results.forEach((result) => {
        expect(result.isAuthenticated).toBe(true)
        expect(result.serviceName).toBe("spotify")
      })

      expect(serviceAuthOperations.getUserServiceAuth).toHaveBeenCalledTimes(3)
    })
  })
})


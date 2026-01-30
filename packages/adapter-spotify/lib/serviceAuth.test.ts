import { describe, expect, test, vi, beforeEach } from "vitest"
import { createSpotifyServiceAuthAdapter } from "./serviceAuth"
import { AppContext } from "@repo/types"
import { appContextFactory } from "@repo/factories"
import * as refreshOp from "./operations/refreshSpotifyAccessToken"

// Mock the Spotify token refresh operation
vi.mock("./operations/refreshSpotifyAccessToken", () => ({
  refreshSpotifyAccessToken: vi.fn(),
}))

describe("createSpotifyServiceAuthAdapter", () => {
  let mockContext: AppContext
  let spotifyAuthAdapter: ReturnType<typeof createSpotifyServiceAuthAdapter>
  let mockGetUserServiceAuth: ReturnType<typeof vi.fn>
  let mockDeleteUserServiceAuth: ReturnType<typeof vi.fn>
  let mockStoreUserServiceAuth: ReturnType<typeof vi.fn>

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
    
    // Create mock functions for context.data
    mockGetUserServiceAuth = vi.fn()
    mockDeleteUserServiceAuth = vi.fn()
    mockStoreUserServiceAuth = vi.fn()
    
    // Build context with mocked data functions
    mockContext = {
      ...appContextFactory.build(),
      data: {
        getUserServiceAuth: mockGetUserServiceAuth,
        deleteUserServiceAuth: mockDeleteUserServiceAuth,
        storeUserServiceAuth: mockStoreUserServiceAuth,
      },
    } as unknown as AppContext
    
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

      mockGetUserServiceAuth.mockResolvedValue(mockAuth)

      const result = await spotifyAuthAdapter.getAuthStatus("user123")

      expect(result).toEqual({
        isAuthenticated: true,
        accessToken: "mock-access-token",
        serviceName: "spotify",
      })

      expect(mockGetUserServiceAuth).toHaveBeenCalledWith({
        userId: "user123",
        serviceName: "spotify",
      })
    })

    test("should return unauthenticated status when no tokens found", async () => {
      mockGetUserServiceAuth.mockResolvedValue(null)

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

      mockGetUserServiceAuth.mockResolvedValue(mockAuth)

      const result = await spotifyAuthAdapter.getAuthStatus("user123")

      expect(result).toEqual({
        isAuthenticated: false,
        accessToken: "",
        serviceName: "spotify",
      })
    })

    test("should handle errors gracefully and return unauthenticated", async () => {
      mockGetUserServiceAuth.mockRejectedValue(new Error("Redis connection failed"))

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

      mockGetUserServiceAuth.mockResolvedValue(mockAuth)

      const result = await spotifyAuthAdapter.getAuthStatus("user456")

      expect(mockGetUserServiceAuth).toHaveBeenCalledWith({
        userId: "user456",
        serviceName: "spotify",
      })

      expect(result.isAuthenticated).toBe(true)
      expect(result.accessToken).toBe("different-access-token")
    })
  })

  describe("logout", () => {
    test("should call deleteUserServiceAuth with correct parameters", async () => {
      mockDeleteUserServiceAuth.mockResolvedValue(undefined)

      await spotifyAuthAdapter.logout("user123")

      expect(mockDeleteUserServiceAuth).toHaveBeenCalledWith({
        userId: "user123",
        serviceName: "spotify",
      })
    })

    test("should work with different user IDs", async () => {
      mockDeleteUserServiceAuth.mockResolvedValue(undefined)

      await spotifyAuthAdapter.logout("user789")

      expect(mockDeleteUserServiceAuth).toHaveBeenCalledWith({
        userId: "user789",
        serviceName: "spotify",
      })
    })

    test("should not throw error when user has no auth to delete", async () => {
      mockDeleteUserServiceAuth.mockResolvedValue(undefined)

      await expect(spotifyAuthAdapter.logout("nonexistent-user")).resolves.not.toThrow()
    })

    test("should propagate errors from deleteUserServiceAuth", async () => {
      const error = new Error("Redis delete failed")
      mockDeleteUserServiceAuth.mockRejectedValue(error)

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

      mockGetUserServiceAuth.mockResolvedValue(mockAuth)
      mockStoreUserServiceAuth.mockResolvedValue(undefined)

      const result = await spotifyAuthAdapter.refreshAuth("user123")

      // Should call Spotify API to refresh
      expect(refreshOp.refreshSpotifyAccessToken).toHaveBeenCalledWith(
        "current-refresh-token",
        "test-client-id",
        "test-client-secret",
      )

      // Should store the new tokens
      expect(mockStoreUserServiceAuth).toHaveBeenCalledWith({
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

      mockGetUserServiceAuth.mockResolvedValue(mockAuth)

      await expect(spotifyAuthAdapter.refreshAuth("user123")).rejects.toThrow(
        "No refresh token available",
      )
    })

    test("should throw error when no auth data exists", async () => {
      mockGetUserServiceAuth.mockResolvedValue(null)

      await expect(spotifyAuthAdapter.refreshAuth("user123")).rejects.toThrow(
        "No refresh token available",
      )
    })

    test("should throw error when auth exists but tokens are undefined", async () => {
      mockGetUserServiceAuth.mockResolvedValue({
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
      mockGetUserServiceAuth.mockResolvedValue(mockAuth)
      const statusAfterLogin = await spotifyAuthAdapter.getAuthStatus("user123")
      expect(statusAfterLogin.isAuthenticated).toBe(true)

      // Logout
      mockDeleteUserServiceAuth.mockResolvedValue(undefined)
      await spotifyAuthAdapter.logout("user123")

      // Check status after logout
      mockGetUserServiceAuth.mockResolvedValue(null)
      const statusAfterLogout = await spotifyAuthAdapter.getAuthStatus("user123")
      expect(statusAfterLogout.isAuthenticated).toBe(false)
    })

    test("should handle token refresh when tokens are expired", async () => {
      const expiredAuth = {
        accessToken: "expired-access-token",
        refreshToken: "valid-refresh-token",
        expiresAt: Date.now() - 1000,
      }

      mockGetUserServiceAuth.mockResolvedValue(expiredAuth)
      mockStoreUserServiceAuth.mockResolvedValue(undefined)

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
      mockGetUserServiceAuth.mockResolvedValue(null)

      const result = await spotifyAuthAdapter.getAuthStatus("")

      expect(mockGetUserServiceAuth).toHaveBeenCalledWith({
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

      mockGetUserServiceAuth.mockResolvedValue(mockAuth)

      const result = await spotifyAuthAdapter.getAuthStatus(specialUserId)

      expect(mockGetUserServiceAuth).toHaveBeenCalledWith({
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

      mockGetUserServiceAuth.mockResolvedValue(mockAuth)

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

      expect(mockGetUserServiceAuth).toHaveBeenCalledTimes(3)
    })
  })
})


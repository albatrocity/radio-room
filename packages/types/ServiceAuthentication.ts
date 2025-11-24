/**
 * Generic service authentication types
 * These types support any music service adapter (Spotify, Tidal, Apple Music, etc.)
 */

export type ServiceAuthenticationTokens = {
  accessToken: string
  refreshToken: string
  expiresAt?: number
}

export type ServiceAuthenticationStatus = {
  isAuthenticated: boolean
  accessToken?: string
  serviceName: string
}

export type ServiceAuthenticationAdapter = {
  /**
   * The unique identifier for this service (e.g., "spotify", "tidal", "apple-music")
   */
  serviceName: string

  /**
   * Check if a user is authenticated with this service
   */
  getAuthStatus: (userId: string) => Promise<ServiceAuthenticationStatus>

  /**
   * Logout a user from this service
   */
  logout: (userId: string) => Promise<void>

  /**
   * Refresh authentication tokens if needed
   */
  refreshAuth?: (userId: string) => Promise<ServiceAuthenticationTokens>
}


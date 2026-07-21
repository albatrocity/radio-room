export type StoredTokens = { 
  accessToken: string
  refreshToken: string
  metadata?: Record<string, unknown>
}

export type AdapterAuthentication =
  | { type: "none" }
  | {
      type: "token"
      getStoredTokens: () => Promise<StoredTokens>
      clientId: string
    }
  | {
      type: "oauth"
      token: {
        accessToken: string
        refreshToken: string
      }
      getStoredTokens: () => Promise<StoredTokens>
      /**
       * Force a token refresh (e.g. after Spotify returns 401 Bad or expired token).
       * Optional: adapters that omit this cannot recover mid-request from revoked access tokens.
       */
      refreshTokens?: () => Promise<StoredTokens>
      clientId: string
    }

export type AdapterConfig = {
  name: string
  authentication: AdapterAuthentication
}

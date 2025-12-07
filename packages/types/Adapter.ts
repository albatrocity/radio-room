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
      clientId: string
    }

export type AdapterConfig = {
  name: string
  authentication: AdapterAuthentication
}

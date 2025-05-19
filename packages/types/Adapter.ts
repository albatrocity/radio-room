export type AdapterAuthentication =
  | { type: "none" }
  | {
      type: "token"
      getStoredTokens: () => Promise<{ accessToken: string; refreshToken: string }>
      clientId: string
    }
  | {
      type: "oauth"
      token: {
        accessToken: string
        refreshToken: string
      }
      getStoredTokens: () => Promise<{ accessToken: string; refreshToken: string }>
      clientId: string
    }

export type AdapterConfig = {
  name: string
  authentication: AdapterAuthentication
}

// state machine for Spotify PKCE authentication flow
import { createMachine, assign } from "xstate"

import {
  generateCodeVerifier,
  generateLoginUrl,
  requestToken,
} from "../lib/spotifyPKCE"

const SPOTIFY_ACCESS_TOKEN = "spotifyAccessToken"
const SPOTIFY_REFRESH_TOKEN = "spotifyRefreshToken"
const SPOTIFY_CODE_VERIFIER = "spotifyCodeVerifier"

export interface SpotifyUserAuthContext {
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  codeVerifier?: string
  loginUrl?: string
  code?: string
  error?: string
}

export type UserAuthEvent =
  | {
      type: "GENERATE_LOGIN_URL"
      data: null
    }
  | {
      type: "REQUEST_TOKEN"
      data: string
    }
  | {
      type: "done.invoke.generateCodeVerifier"
      data: string
    }

type TokenEvent = {
  type: "done.invoke.requestToken"
  data: {
    access_token: string
    expires_in: number
    refresh_token: string
    scope: string
    token_type: "Bearer"
  }
}

async function getStoredTokens() {
  const accessToken = await sessionStorage.getItem(SPOTIFY_ACCESS_TOKEN)
  const refreshToken = await sessionStorage.getItem(SPOTIFY_REFRESH_TOKEN)
  console.log("GET STORED TOKENS!", accessToken, refreshToken)
  if (!accessToken) throw new Error("No access token found")
  if (!refreshToken) throw new Error("No refresh token found")
  return { accessToken, refreshToken }
}

async function getStoredCodeVerifier() {
  const verifier = await sessionStorage.getItem(SPOTIFY_CODE_VERIFIER)
  console.log("GET STORED CODE VERIFIER!", verifier)
  if (!verifier) throw new Error("No code verifier found")
  return verifier
}

export const spotifyAuthMachine = createMachine<
  SpotifyUserAuthContext,
  UserAuthEvent
>(
  {
    predictableActionArguments: true,
    id: "spotify-user-auth",
    initial: "initial",
    context: {
      accessToken: undefined,
      refreshToken: undefined,
      expiresIn: undefined,
      codeVerifier: undefined,
      loginUrl: undefined,
      error: undefined,
    },
    states: {
      initial: {
        invoke: {
          id: "getStoredTokens",
          src: getStoredTokens,
          onError: {
            target: "unauthenticated",
          },
          onDone: {
            target: "authenticated",
            actions: assign((_ctx, event) => {
              return {
                accessToken: event.data.accessToken,
                refreshToken: event.data.refreshToken,
              }
            }),
          },
        },
      },
      unauthenticated: {
        on: {
          GENERATE_LOGIN_URL: "working.generatingVerifier",
          REQUEST_TOKEN: {
            target: "working.handlingCallback",
            actions: ["setCode"],
          },
        },
      },
      authenticated: {
        id: "authenticated",
      },
      working: {
        states: {
          generatingVerifier: {
            invoke: {
              id: "generateCodeVerifier",
              src: generateCodeVerifier,
              onDone: {
                target: "generatingLoginUrl",
                actions: ["setCodeVerifier", "storeCodeVerifier"],
              },
            },
          },
          generatingLoginUrl: {
            invoke: {
              id: "generateLoginUrl",
              src: generateLoginUrl,
              onDone: {
                target: "awaitingCallback",
                actions: ["setLoginUrl"],
              },
            },
          },
          awaitingCallback: {
            entry: ["navigateToLogin"],
          },
          handlingCallback: {
            invoke: {
              id: "getStoredCodeVerifier",
              src: getStoredCodeVerifier,
              onDone: {
                target: "requestingToken",
                actions: ["setCodeVerifier"],
              },
            },
          },
          requestingToken: {
            invoke: {
              id: "requestToken",
              src: requestToken,
              onDone: {
                target: "#authenticated",
                actions: [
                  assign((_ctx, event: TokenEvent) => {
                    console.log(event.data)
                    return {
                      accessToken: event.data.access_token,
                      refreshToken: event.data.refresh_token,
                      expiresIn: event.data.expires_in,
                    }
                  }),
                  (_ctx, event: TokenEvent) => {
                    if (event.data) {
                      sessionStorage.setItem(
                        SPOTIFY_ACCESS_TOKEN,
                        event.data.access_token,
                      )
                      sessionStorage.setItem(
                        SPOTIFY_REFRESH_TOKEN,
                        event.data.refresh_token,
                      )
                    }
                  },
                  "onFinish",
                ],
              },
              onError: {
                target: "..unauthenticated",
                actions: ["setError", "onFinish"],
              },
            },
          },
        },
      },
    },
  },
  {
    actions: {
      setCodeVerifier: assign({
        codeVerifier: (ctx, event) => event.data ?? ctx.codeVerifier,
      }),
      storeCodeVerifier: (_ctx, event) => {
        if (event.data) {
          sessionStorage.setItem(SPOTIFY_CODE_VERIFIER, event.data)
        }
      },
      setLoginUrl: assign({
        loginUrl: (ctx, event) => event.data ?? ctx.loginUrl,
      }),
      setCode: assign({
        code: (ctx, event) => event.data ?? ctx.code,
      }),
      setError: assign({
        error: (ctx, event) => event.data ?? ctx.error,
      }),
    },
    guards: {
      isAuthenticated: (ctx) => {
        return !!ctx.accessToken
      },
      isUnauthenticated: (ctx) => {
        return !ctx.accessToken
      },
    },
  },
)

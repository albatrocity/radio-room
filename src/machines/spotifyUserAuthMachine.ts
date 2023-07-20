// state machine for Spotify PKCE authentication flow
import { createMachine, assign } from "xstate"

import timerMachine from "./TimerMachine"

import {
  generateCodeVerifier,
  generateLoginUrl,
  requestToken,
  refreshAccessToken,
} from "../lib/spotify/spotifyPKCE"
import { toast } from "../lib/toasts"
import socketService from "../lib/socketService"

const SPOTIFY_ACCESS_TOKEN = "spotifyAccessToken"
const SPOTIFY_REFRESH_TOKEN = "spotifyRefreshToken"
const SPOTIFY_CODE_REFRESHED_AT = "spotifyCodeRefreshedAt"
const SPOTIFY_CODE_VERIFIER = "spotifyCodeVerifier"

export interface SpotifyUserAuthContext {
  accessToken?: string
  refreshToken?: string
  refreshedAt?: number
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
      type: "LOGOUT"
    }
  | {
      type: "done.invoke.generateCodeVerifier"
      data: string
    }
  | {
      type: "done.invoke.getStoredCodeVerifier"
      data: string
    }
  | {
      type: "done.invoke.generateLoginUrl"
      data: string
    }
  | {
      type: "error.invoke.requestToken"
      data: string
    }
  | {
      type: "INIT"
      data: {
        accessToken?: string
      }
    }
  | {
      type: "SPOTIFY_ACCESS_TOKEN_REFRESHED"
      data: {
        accessToken?: string
      }
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
  const refreshedAt = await sessionStorage.getItem(SPOTIFY_CODE_REFRESHED_AT)
  if (!accessToken) throw new Error("No access token found")
  if (!refreshToken) throw new Error("No refresh token found")
  return { accessToken, refreshToken, refreshedAt }
}

async function getStoredCodeVerifier() {
  console.log("GET STORED CODE VERIFIER")
  const verifier = await sessionStorage.getItem(SPOTIFY_CODE_VERIFIER)
  console.log("verifier", verifier)
  if (!verifier) throw new Error("No code verifier found")
  return verifier
}

function getTimeToRefresh(ctx: SpotifyUserAuthContext) {
  return (
    (ctx.refreshedAt ?? Date.now()) +
    (ctx.expiresIn ?? 3600) * 1000 -
    Date.now()
  )
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
      refreshedAt: undefined,
      codeVerifier: undefined,
      loginUrl: undefined,
      error: undefined,
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
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
                refreshedAt: event.data.refreshedAt,
              }
            }),
          },
        },
      },
      unauthenticated: {
        id: "unauthenticated",
        on: {
          GENERATE_LOGIN_URL: "working.generatingVerifier",
          REQUEST_TOKEN: {
            target: "working.handlingCallback",
            actions: ["setCode"],
          },
          INIT: {
            actions: ["assignAccessToken"],
            target: "authenticated",
            cond: "hasAccessToken",
          },
          SPOTIFY_ACCESS_TOKEN_REFRESHED: {
            actions: ["assignAccessToken"],
            target: "authenticated",
            cond: "hasAccessToken",
          },
        },
      },
      authenticated: {
        id: "authenticated",
        initial: "active",
        on: {
          LOGOUT: {
            target: "unauthenticated",
            actions: [
              "logout",
              "notifyLogout",
              (_ctx) => {
                sessionStorage.removeItem(SPOTIFY_ACCESS_TOKEN)
                sessionStorage.removeItem(SPOTIFY_REFRESH_TOKEN)
              },
            ],
          },
        },
        states: {
          active: {
            invoke: {
              id: "timer",
              src: timerMachine,
              data: {
                duration: (ctx: SpotifyUserAuthContext) =>
                  getTimeToRefresh(ctx),
              },
              onDone: {
                target: "refreshing",
              },
            },
          },
          refreshing: {
            invoke: {
              id: "refreshToken",
              src: refreshAccessToken,
              onDone: {
                target: "active",
                actions: [
                  // set token data and save token data
                  // done inline to avoid type errors on event data
                  assign((_ctx, event: TokenEvent) => {
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
                  "setRefreshedAt",
                  "storeRefreshedAt",
                ],
              },
              onError: {
                target: "#unauthenticated",
              },
            },
          },
        },
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
                  // set token data and save token data
                  // done inline to avoid type errors on event data
                  assign((_ctx, event: TokenEvent) => {
                    console.log("ACTION", event.data)
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
                  "setRefreshedAt",
                  "storeRefreshedAt",
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
        codeVerifier: (ctx, event) => {
          console.log("set code verifier", event)
          if (
            event.type !== "done.invoke.generateCodeVerifier" &&
            event.type !== "done.invoke.getStoredCodeVerifier"
          ) {
            return ctx.codeVerifier
          }
          return event.data
        },
      }),
      storeCodeVerifier: (_ctx, event) => {
        if (event.type !== "done.invoke.generateCodeVerifier") {
          return // only store code verifier on success
        }
        if (event.data) {
          sessionStorage.setItem(SPOTIFY_CODE_VERIFIER, event.data)
        }
      },
      setLoginUrl: assign({
        loginUrl: (ctx, event) => {
          if (event.type !== "done.invoke.generateLoginUrl") {
            return ctx.loginUrl // keep existing login url on error
          }
          return event.data
        },
      }),
      setCode: assign({
        code: (ctx, event) => {
          if (event.type !== "REQUEST_TOKEN") {
            return ctx.code
          }
          return event.data
        },
      }),
      setError: assign({
        error: (ctx, event) => {
          if (event.type !== "error.invoke.requestToken") {
            return ctx.error
          }
          return event.data
        },
      }),
      setRefreshedAt: assign({
        refreshedAt: () => Date.now(),
      }),
      storeRefreshedAt: () => {
        sessionStorage.setItem(SPOTIFY_CODE_REFRESHED_AT, String(Date.now()))
      },
      logout: assign({
        accessToken: undefined,
        refreshToken: undefined,
        refreshedAt: undefined,
        expiresIn: undefined,
      }),
      notifyLogout: () => {
        toast({
          title: "Spotify Disconnected",
          description: "Your Spotify account is now unlinked",
          status: "success",
        })
      },
      assignAccessToken: assign({
        accessToken: (ctx, event) => {
          if (event.type !== "INIT") {
            return ctx.accessToken
          }
          return event.data.accessToken ?? ctx.accessToken
        },
      }),
    },
    guards: {
      hasAccessToken: (ctx, event) => {
        if (event.type !== "INIT") {
          return !!ctx.accessToken
        }
        return !!event.data.accessToken
      },
    },
  },
)

import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { spotifyAuthMachine } from "../machines/spotifyUserAuthMachine"
import { navigate } from "gatsby"

export const useSpotifyAuthStore = create(
  xstate(
    spotifyAuthMachine.withConfig({
      actions: {
        navigateToLogin: (ctx) => {
          if (ctx.loginUrl) {
            navigate(ctx.loginUrl)
          }
        },
        onFinish: () => {
          const path = sessionStorage.getItem("postSpotifyAuthRedirect") ?? "/"
          navigate(path, {
            replace: true,
            state: {
              toast: {
                title: "Spotify Connected",
                description: "Your Spotify account is now linked",
                status: "success",
                duration: 5000,
                isClosable: true,
                position: "top",
              },
            },
          })
        },
      },
    }),
  ),
)

export const useIsSpotifyAuthenticated = () => {
  return useSpotifyAuthStore((s) => !!s.state.context.accessToken)
}

export const useSpotifyAccessToken = () => {
  return useSpotifyAuthStore((s) => s.state.context.accessToken)
}

export const useSpotifyLoginUrl = () => {
  return useSpotifyAuthStore((s) => s.state.context.loginUrl)
}

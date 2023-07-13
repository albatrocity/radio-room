import { RoomError } from "../types/Room"

export function getErrorMessage({ status }: RoomError, isAdmin?: boolean) {
  switch (status) {
    case 401:
      return isAdmin
        ? "Your Spotify account has been disconnected. Please log back into Spotify."
        : "The Spotify account connected to this room has been disconnected. The Now Playing information may be incorrect."
    case 403:
      return "You are not authorized to perform this action."
    case 404:
      return "The requested resource could not be found."
    default:
      return "An error occurred with Spotify. Please try again later."
  }
}

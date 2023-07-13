import { RoomError } from "../types/Room"

export function getErrorMessage({ status }: RoomError) {
  switch (status) {
    case 401:
      return "Your Spotify account has been disconnected. Please log back into Spotify."
    case 403:
      return "You are not authorized to perform this action."
    case 404:
      return "The requested resource could not be found."
    default:
      return "An error occurred with Spotify. Please try again later."
  }
}

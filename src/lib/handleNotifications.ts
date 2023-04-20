import addNotification from "react-push-notification"
import { get, isEqual, includes } from "lodash/fp"
import { ChatMessage } from "../types/ChatMessage"
import { User } from "../types/User"

export const handleNotifications = async (
  payload: ChatMessage,
  currentUser?: User | null,
) => {
  const hidden = typeof document.hidden !== "undefined" ? "hidden" : undefined

  const mentioned = includes(
    get("userId", currentUser),
    get("mentions", payload),
  )
  const authorIsMe = isEqual(
    get("userId", currentUser),
    get("user.userId", payload),
  )

  if (hidden && mentioned && !authorIsMe && document[hidden]) {
    addNotification({
      title: "@Mention in Radio Room",
      message: payload?.content,
      native: true,
    })
  }
}

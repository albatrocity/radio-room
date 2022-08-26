import addNotification from "react-push-notification"
import { get, isEqual, includes } from "lodash/fp"

export const handleNotifications = async (
  payload: { content: string },
  currentUser: User,
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
      message: payload.content,
      native: true,
    })
  }
}

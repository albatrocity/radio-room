import addNotification from "react-push-notification"
import { get, isEqual, includes } from "lodash/fp"
import { getCurrentUser } from "./getCurrentUser"

export const handleNotifications = async payload => {
  var hidden, visibilityChange
  if (typeof document.hidden !== "undefined") {
    // Opera 12.10 and Firefox 18 and later support
    hidden = "hidden"
    visibilityChange = "visibilitychange"
  } else if (typeof document.msHidden !== "undefined") {
    hidden = "msHidden"
    visibilityChange = "msvisibilitychange"
  } else if (typeof document.webkitHidden !== "undefined") {
    hidden = "webkitHidden"
    visibilityChange = "webkitvisibilitychange"
  }

  const { currentUser } = await getCurrentUser()
  const mentioned = includes(
    get("userId", currentUser),
    get("mentions", payload)
  )
  const authorIsMe = isEqual(
    get("userId", currentUser),
    get("user.userId", payload)
  )

  if (mentioned && !authorIsMe && document[hidden]) {
    addNotification({
      title: "@Mention in Radio Room",
      message: payload.content,
      native: true,
    })
  }
}

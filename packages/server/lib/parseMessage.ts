import mustache from "mustache"
import getMessageVariables from "./getMessageVariables"
import { AppContext } from "@repo/types"

export function parseMessage({
  context,
  roomId,
  message = "",
  variables,
}: {
  context: AppContext
  roomId: string
  message: string
  variables?: Record<string, any>
}) {
  const mentionRegex = /([])|\@\[(.*?)\]\(.*?\)/gm
  const idRegex = /(\(.*\))/gm
  const mentionMatches = (message || "").match(mentionRegex) ?? []
  const mentions = mentionMatches.map((x) =>
    (x.match(idRegex) ?? "")?.[0].replace(/(\()/gm, "").replace(/(\))/gm, ""),
  )
  const content = message.replace(mentionRegex, "@$2")
  const view = { ...getMessageVariables({ context, roomId }), ...variables }

  const parsedContent = mustache.render(content, view)

  return {
    mentions,
    content: parsedContent,
  }
}

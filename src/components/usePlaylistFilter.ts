import createTrackId from "../lib/createTrackId"
import { useGetAllReactionsOf } from "../state/reactionsStore"

import { Emoji } from "../types/Emoji"
import { PlaylistItem } from "../types/PlaylistItem"

export default function usePlaylistFilter(items: PlaylistItem[]) {
  const getReactions = useGetAllReactionsOf("track")
  return (emojis: Emoji[]) => {
    const emojiKeys = Object.keys(emojis)
    return items.filter((item) => {
      const { track, artist, album } = item
      const id = createTrackId({ track, artist, album })
      const reactions = getReactions(id)
      const matches = emojiKeys.filter((x) =>
        reactions.map((reaction) => reaction.emoji).includes(x),
      )
      return matches.length === emojiKeys.length
    })
  }
}

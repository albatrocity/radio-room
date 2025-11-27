import { useGetAllReactionsOf } from "../state/reactionsStore"

import { Emoji } from "../types/Emoji"
import { PlaylistItem } from "../types/PlaylistItem"

export default function usePlaylistFilter(items: PlaylistItem[]) {
  const getReactions = useGetAllReactionsOf("track")
  return (emojis: Emoji[]) => {
    const emojiKeys = Object.keys(emojis)
    return items.filter((item) => {
      // Use the actual mediaSource trackId (e.g., Spotify track ID)
      // This ensures reactions match what the backend plugin expects
      const id = item.mediaSource.trackId
      const reactions = getReactions(id)
      const matches = emojiKeys.filter((x) =>
        reactions.map((reaction) => reaction.emoji).includes(x),
      )
      return matches.length === emojiKeys.length
    })
  }
}

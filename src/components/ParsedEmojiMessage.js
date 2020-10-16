import React, { useContext } from "react"
import { Emoji } from "emoji-mart"
import { ResponsiveContext, ThemeContext } from "grommet"
const colons = `:[a-zA-Z0-9-_+]+:`
const skin = `:skin-tone-[2-6]:`
const colonsRegex = new RegExp(`(${colons}${skin}|${colons})`, "g")

const ParsedEmojiMessage = ({ content }) => {
  const theme = useContext(ThemeContext)
  const size = useContext(ResponsiveContext)
  const emojiSize = parseInt(theme.paragraph[size].size.replace("px", "")) + 4
  return (
    <div>
      {content
        .split(colonsRegex)
        .map(
          (emoji, idx) =>
            !!emoji && (
              <Emoji
                size={emojiSize}
                key={idx}
                emoji={emoji}
                fallback={() => emoji}
              />
            )
        )}
    </div>
  )
}

export default ParsedEmojiMessage

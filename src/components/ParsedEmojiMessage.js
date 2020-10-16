import React, { useContext } from "react"
import Linkify from "react-linkify"
import nl2br from "react-nl2br"
import { Emoji } from "emoji-mart"
import { ResponsiveContext, ThemeContext, Anchor } from "grommet"
const colons = `:[a-zA-Z0-9-_+]+:`
const skin = `:skin-tone-[2-6]:`
const colonsRegex = new RegExp(`(${colons}${skin}|${colons})`, "g")

const componentDecorator = (href, text, key) => (
  <Anchor href={href} key={key} target="_blank" rel="noopener noreferrer">
    {text}
  </Anchor>
)

const ParsedEmojiMessage = ({ content }) => {
  const theme = useContext(ThemeContext)
  const size = useContext(ResponsiveContext)
  const emojiSize = parseInt(theme.paragraph[size].size.replace("px", "")) + 4

  return (
    <>
      {content.split(colonsRegex).map((emoji, idx) => {
        return (
          <Emoji
            key={idx}
            emoji={emoji}
            size={emojiSize}
            set="apple"
            fallback={(emoji, props) => {
              return emoji ? (
                `:${emoji.short_names[0]}:`
              ) : (
                <Linkify componentDecorator={componentDecorator}>
                  {nl2br(props.emoji)}
                </Linkify>
              )
            }}
          />
        )
      })}
    </>
  )
}

export default ParsedEmojiMessage

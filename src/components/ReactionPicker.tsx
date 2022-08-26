import React, { useContext } from "react"
import "emoji-mart/css/emoji-mart.css"
import data from "emoji-mart/data/apple.json"
import { NimblePicker } from "emoji-mart/dist-modern/index.js"
import { ThemeContext } from "grommet"
import { EmojiData } from "emoji-mart"

interface ReactionPickerProps {
  onSelect: (emoji: EmojiData) => void
}

const ReactionPicker = ({ onSelect }: ReactionPickerProps) => {
  const theme = useContext(ThemeContext)
  return (
    <NimblePicker
      autoFocus={true}
      sheetSize={64}
      perLine={7}
      title={""}
      data={data}
      set="apple"
      onSelect={onSelect}
      color={theme.global.colors.brand}
    />
  )
}

export default ReactionPicker

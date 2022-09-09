import React from "react"
import Picker from "@emoji-mart/react"
import data from "@emoji-mart/data"

interface ReactionPickerProps {
  onSelect: (emoji: EmojiData) => void
}

const ReactionPicker = ({ onSelect }: ReactionPickerProps) => {
  return (
    <Picker autoFocus={true} perLine={7} onEmojiSelect={onSelect} data={data} />
  )
}

export default ReactionPicker

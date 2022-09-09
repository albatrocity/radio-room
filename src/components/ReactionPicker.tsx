import React from "react"
import data from "@emoji-mart/data"
import { Picker } from "emoji-mart"
import { EmojiData } from "emoji-mart"

interface ReactionPickerProps {
  onSelect: (emoji: EmojiData) => void
}

const ReactionPicker = ({ onSelect }: ReactionPickerProps) => {
  return (
    <Picker
      autoFocus={true}
      sheetSize={64}
      perLine={7}
      title={""}
      data={data}
      set="apple"
      onSelect={onSelect}
    />
  )
}

export default ReactionPicker

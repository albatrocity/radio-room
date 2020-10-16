import React, { useContext } from "react"
import "emoji-mart/css/emoji-mart.css"
import data from "emoji-mart/data/apple.json"
import { NimblePicker } from "emoji-mart"
import { ThemeContext } from "grommet"

const ReactionPicker = ({ onSelect }) => {
  const theme = useContext(ThemeContext)
  return (
    <NimblePicker
      autoFocus={true}
      sheetSize={20}
      title={""}
      data={data}
      set="apple"
      onSelect={onSelect}
      color={theme.global.colors.brand}
    />
  )
}

export default ReactionPicker

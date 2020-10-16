import React from "react"
import "emoji-mart/css/emoji-mart.css"
import data from "emoji-mart/data/apple.json"
import { NimblePicker } from "emoji-mart"

const ReactionPicker = ({ onSelect }) => (
  <NimblePicker
    autoFocus={true}
    title={""}
    data={data}
    set="apple"
    onSelect={onSelect}
  />
)

export default ReactionPicker

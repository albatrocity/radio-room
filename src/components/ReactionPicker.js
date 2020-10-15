import React from "react"
import "emoji-mart/css/emoji-mart.css"
import data from "emoji-mart/data/apple.json"
import { Picker } from "emoji-mart"

const ReactionPicker = ({ onSelect }) => (
  <Picker data={data} set="apple" onSelect={onSelect} />
)

export default ReactionPicker

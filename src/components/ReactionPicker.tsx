import React, { MutableRefObject, ReactNode } from "react"
import Picker from "@emoji-mart/react"
import { EmojiData } from "emoji-mart"
import data from "@emoji-mart/data"
import { Box } from "@chakra-ui/react"

interface ReactionPickerProps {
  onSelect: (emoji: EmojiData) => void
}

const ReactionPicker = React.forwardRef(
  ({ onSelect }: ReactionPickerProps, ref) => (
    <Box
      ref={ref}
      sx={{
        "em-emoji-picker": {
          height: "50vh",
          width: "100%",
        },
      }}
    >
      <Picker
        autoFocus={true}
        onEmojiSelect={onSelect}
        dynamicWidth={true}
        data={data}
      />
    </Box>
  ),
)

export default ReactionPicker

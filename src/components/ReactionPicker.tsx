import React from "react"
import Picker from "@emoji-mart/react"
import { EmojiData } from "emoji-mart"
import data from "@emoji-mart/data"
import { Box } from "@chakra-ui/react"

interface ReactionPickerProps {
  onSelect: (emoji: EmojiData) => void
}

const ReactionPicker = React.forwardRef(
  ({ onSelect }: ReactionPickerProps, ref) => {
    return (
      <Box
        ref={ref}
        sx={{
          "em-emoji-picker": {
            height: "40vh",
            width: "100%",
          },
        }}
      >
        <Picker
          autoFocus={true}
          onEmojiSelect={onSelect}
          dynamicWidth={true}
          data={data}
          previewPosition="none"
        />
      </Box>
    )
  },
)

export default ReactionPicker

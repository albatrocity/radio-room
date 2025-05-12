import React, { memo } from "react"
import Picker from "@emoji-mart/react"
import { EmojiData } from "emoji-mart"
import data from "@emoji-mart/data"
import { Box } from "@chakra-ui/react"

interface ReactionPickerProps {
  onSelect: (emoji: EmojiData) => void
  autoFocus?: boolean
}

const ReactionPicker = React.forwardRef(
  ({ onSelect, autoFocus }: ReactionPickerProps, ref) => {
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
          autoFocus={autoFocus}
          onEmojiSelect={onSelect}
          dynamicWidth={true}
          data={data}
          previewPosition="none"
        />
      </Box>
    )
  },
)

export default memo(ReactionPicker)

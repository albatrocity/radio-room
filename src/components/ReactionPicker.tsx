import React from "react"
import Picker from "@emoji-mart/react"
import { EmojiData } from "emoji-mart"
import data from "@emoji-mart/data"
import { Box } from "@chakra-ui/react"

import { useBreakpointValue } from "@chakra-ui/react"

interface ReactionPickerProps {
  onSelect: (emoji: EmojiData) => void
}

const ReactionPicker = React.forwardRef(
  ({ onSelect }: ReactionPickerProps, ref) => {
    const autoFocus = useBreakpointValue(
      {
        base: false,
        sm: false,
        md: true,
      },
      {
        fallback: "md",
      },
    )
    return (
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

export default ReactionPicker

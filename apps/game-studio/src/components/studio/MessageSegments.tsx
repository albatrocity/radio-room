"use client"

import { Box } from "@chakra-ui/react"
import type { TextSegment } from "@repo/types"
import { textEffectStyles } from "../../lib/textEffects"

export function MessageSegments({ segments }: { segments: TextSegment[] }) {
  return (
    <Box as="span" whiteSpace="pre-wrap" wordBreak="break-word">
      {segments.map((segment, idx) => (
        <Box key={idx} as="span" css={textEffectStyles(segment.effects)}>
          {segment.text}
        </Box>
      ))}
    </Box>
  )
}

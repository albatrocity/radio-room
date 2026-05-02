import { Box, Image, Stack } from "@chakra-ui/react"
import type { TextEffect, TextSegment } from "@repo/types"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { textEffectStyles } from "../lib/textEffects"
import { splitMarkdownImages } from "../lib/splitMarkdownImages"

type InlinePiece = { effects?: TextEffect[]; text: string }

type Row = { type: "inline"; items: InlinePiece[] } | { type: "image"; src: string; alt: string }

function segmentsToRows(segments: TextSegment[]): Row[] {
  const pieces: Array<{ type: "inline"; piece: InlinePiece } | { type: "image"; src: string; alt: string }> = []

  for (const seg of segments) {
    for (const chunk of splitMarkdownImages(seg.text)) {
      if (chunk.type === "image") {
        pieces.push({ type: "image", src: chunk.src, alt: chunk.alt })
      } else if (chunk.value.length > 0) {
        pieces.push({ type: "inline", piece: { effects: seg.effects, text: chunk.value } })
      }
    }
  }

  const rows: Row[] = []
  let inlineBuf: InlinePiece[] = []

  for (const p of pieces) {
    if (p.type === "image") {
      if (inlineBuf.length > 0) {
        rows.push({ type: "inline", items: inlineBuf })
        inlineBuf = []
      }
      rows.push({ type: "image", src: p.src, alt: p.alt })
    } else {
      inlineBuf.push(p.piece)
    }
  }
  if (inlineBuf.length > 0) {
    rows.push({ type: "inline", items: inlineBuf })
  }

  return rows
}

export function MessageSegments({ segments }: { segments: TextSegment[] }) {
  const rows = segmentsToRows(segments)

  return (
    <Stack gap={0.5} align="stretch" w="100%" minW={0}>
      {rows.map((row, i) =>
        row.type === "inline" ? (
          <Box
            key={i}
            display="flex"
            flexWrap="wrap"
            alignItems="baseline"
            justifyContent="flex-start"
            gap={0.5}
          >
            {row.items.map((item, j) => (
              <Box as="span" key={j} css={textEffectStyles(item.effects)} verticalAlign="baseline">
                <ParsedEmojiMessage content={item.text} inlineParagraphs />
              </Box>
            ))}
          </Box>
        ) : (
          <Box key={i} w="100%" minW={0}>
            <Image
              src={row.src}
              alt={row.alt || "Image"}
              maxW="100%"
              maxH="60vh"
              w="100%"
              objectFit="contain"
              display="block"
            />
          </Box>
        ),
      )}
    </Stack>
  )
}

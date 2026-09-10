import { Box, Image, Stack } from "@chakra-ui/react"
import { useEffect } from "react"
import type { TextEffect, TextSegment } from "@repo/types"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { textEffectStyles } from "@repo/game-logic"
import { splitMarkdownImages } from "../lib/splitMarkdownImages"
import { ensureComicNeue, textEffectsNeedComicNeue } from "../lib/ensureComicNeue"

type InlinePiece = { effects?: TextEffect[]; text: string }

type Row = { type: "inline"; items: InlinePiece[] } | { type: "image"; src: string; alt: string }

function effectsKey(effects?: TextEffect[]): string {
  return JSON.stringify(effects ?? null)
}

/** Join adjacent pieces that share the same effects so Markdown spans can cross word boundaries. */
export function mergeAdjacentSameEffectPieces(items: InlinePiece[]): InlinePiece[] {
  if (items.length === 0) return items
  const merged: InlinePiece[] = []
  for (const item of items) {
    const prev = merged[merged.length - 1]
    if (prev && effectsKey(prev.effects) === effectsKey(item.effects)) {
      prev.text += item.text
    } else {
      merged.push({ effects: item.effects, text: item.text })
    }
  }
  return merged
}

function segmentsToRows(segments: TextSegment[]): Row[] {
  const pieces: Array<
    { type: "inline"; piece: InlinePiece } | { type: "image"; src: string; alt: string }
  > = []

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
        rows.push({ type: "inline", items: mergeAdjacentSameEffectPieces(inlineBuf) })
        inlineBuf = []
      }
      rows.push({ type: "image", src: p.src, alt: p.alt })
    } else {
      inlineBuf.push(p.piece)
    }
  }
  if (inlineBuf.length > 0) {
    rows.push({ type: "inline", items: mergeAdjacentSameEffectPieces(inlineBuf) })
  }

  return rows
}

export function MessageSegments({ segments }: { segments: TextSegment[] }) {
  useEffect(() => {
    if (segments.some((seg) => textEffectsNeedComicNeue(seg.effects))) {
      void ensureComicNeue()
    }
  }, [segments])
  const rows = segmentsToRows(segments)

  return (
    <Stack gap={0.5} align="stretch" w="100%" minW={0}>
      {rows.map((row, i) =>
        row.type === "inline" ? (
          <Box key={i}>
            {row.items.map((item, j) => (
              <Box as="span" key={j} css={textEffectStyles(item.effects)}>
                {/^\s+$/.test(item.text) ? (
                  item.text
                ) : (
                  <ParsedEmojiMessage content={item.text} inlineParagraphs />
                )}
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

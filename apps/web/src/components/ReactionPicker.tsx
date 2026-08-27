import React, { memo, useEffect, useState } from "react"
import Picker from "@emoji-mart/react"
import { EmojiData } from "emoji-mart"
import { Box } from "@chakra-ui/react"

import { ensureEmojiMart } from "../lib/ensureEmojiMart"

interface ReactionPickerProps {
  onSelect: (emoji: EmojiData) => void
  autoFocus?: boolean
}

/** Search uses `calc(var(--font-size) - 1px)` (default 14px), which triggers iOS focus zoom. */
const IOS_SAFE_SEARCH_CSS = ".search input, .search button { font-size: 16px !important; }"

function applyIosSafeSearchFont(root: ParentNode | null | undefined): boolean {
  const host = root?.querySelector("em-emoji-picker")
  const shadow = host?.shadowRoot
  if (!shadow || shadow.getElementById("lr-ios-search")) return !!shadow
  const style = document.createElement("style")
  style.id = "lr-ios-search"
  style.textContent = IOS_SAFE_SEARCH_CSS
  shadow.appendChild(style)
  return true
}

const ReactionPicker = React.forwardRef(({ onSelect, autoFocus }: ReactionPickerProps, ref) => {
  const [data, setData] = useState<unknown>(null)
  const boxRef = React.useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void ensureEmojiMart().then(setData)
  }, [])

  useEffect(() => {
    if (!data) return
    const box = boxRef.current
    if (!box) return
    if (applyIosSafeSearchFont(box)) return
    const observer = new MutationObserver(() => {
      if (applyIosSafeSearchFont(box)) observer.disconnect()
    })
    observer.observe(box, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [data])

  const setRefs = (node: HTMLDivElement | null) => {
    boxRef.current = node
    if (typeof ref === "function") ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
  }

  const handleSelect = (emoji: EmojiData) => {
    const host = boxRef.current?.querySelector("em-emoji-picker")
    host?.shadowRoot?.querySelector<HTMLInputElement>("input[type=search]")?.blur()
    onSelect(emoji)
  }

  if (!data) return null

  return (
    <Box
      ref={setRefs}
      css={{
        "& em-emoji-picker": {
          height: "40vh",
          width: "100%",
          // Search font is calc(var(--font-size) - 1px); 17px → 16px (no iOS zoom).
          "--font-size": "17px",
        },
      }}
    >
      <Picker
        autoFocus={autoFocus}
        onEmojiSelect={handleSelect}
        dynamicWidth={true}
        data={data}
        previewPosition="none"
      />
    </Box>
  )
})

export default memo(ReactionPicker)

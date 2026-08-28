import { useEffect, useRef, useState } from "react"
import { Button, HStack, Input } from "@chakra-ui/react"
import { TRADE_MESSAGE_MAX_LENGTH } from "@repo/types"
import { emitToSocket } from "../../../../actors/socketActor"
import { TYPING_IDLE_MS } from "./tradeDetailConstants"
import { useTradeParticipants } from "./useTradeParticipants"

/** Shared “Say something…” field — pinned in Game State chrome above lock/confirm. */
export function TradeDetailComposer({ tradeId }: { tradeId: string }) {
  const { activeTrade, mine } = useTradeParticipants(tradeId)
  const [draftNote, setDraftNote] = useState("")
  const typingActiveRef = useRef(false)
  const typingIdleTimerRef = useRef<number | null>(null)
  const myPublishedNote = mine?.message ?? null

  useEffect(() => {
    setDraftNote("")
    typingActiveRef.current = false
    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current)
      typingIdleTimerRef.current = null
    }
  }, [tradeId])

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current != null) {
        window.clearTimeout(typingIdleTimerRef.current)
      }
      if (typingActiveRef.current && activeTrade) {
        emitToSocket("TRADE_TYPING", { tradeId: activeTrade.tradeId, typing: false })
      }
    }
    // Only on unmount / trade change via tradeId effect reset
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId])

  const emitTyping = (typing: boolean) => {
    if (!activeTrade) return
    if (typingActiveRef.current === typing) return
    typingActiveRef.current = typing
    emitToSocket("TRADE_TYPING", { tradeId: activeTrade.tradeId, typing })
  }

  const scheduleTypingIdleClear = () => {
    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current)
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      typingIdleTimerRef.current = null
      emitTyping(false)
    }, TYPING_IDLE_MS)
  }

  const onDraftChange = (value: string) => {
    setDraftNote(value.slice(0, TRADE_MESSAGE_MAX_LENGTH))
    if (value.trim().length > 0) {
      emitTyping(true)
      scheduleTypingIdleClear()
    } else {
      if (typingIdleTimerRef.current != null) {
        window.clearTimeout(typingIdleTimerRef.current)
        typingIdleTimerRef.current = null
      }
      emitTyping(false)
    }
  }

  const publishNote = (raw: string) => {
    if (!activeTrade) return
    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current)
      typingIdleTimerRef.current = null
    }
    emitTyping(false)
    emitToSocket("TRADE_SET_MESSAGE", {
      tradeId: activeTrade.tradeId,
      message: raw.slice(0, TRADE_MESSAGE_MAX_LENGTH),
    })
    setDraftNote("")
  }

  if (!activeTrade) return null

  return (
    <HStack gap={2} align="center" w="full">
      <Input
        size="sm"
        flex="1"
        placeholder="Say something…"
        value={draftNote}
        maxLength={TRADE_MESSAGE_MAX_LENGTH}
        onChange={(e) => onDraftChange(e.target.value)}
        onBlur={() => emitTyping(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            publishNote(draftNote)
          }
        }}
      />
      <Button
        size="sm"
        colorPalette="action"
        disabled={!draftNote.trim() && !myPublishedNote}
        onClick={() => publishNote(draftNote)}
      >
        {draftNote.trim() ? "Send" : myPublishedNote ? "Clear" : "Send"}
      </Button>
    </HStack>
  )
}

import { useCallback, useState } from "react"
import {
  Badge,
  Box,
  HStack,
  IconButton,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react"
import { LuMaximize2, LuMinus, LuMusic2 } from "react-icons/lu"
import { emitToSocket } from "../../../actors/socketActor"
import { unlockPreviewAudio } from "../../../lib/previewAudioUnlock"
import { useUserGameStatePayload } from "../../../hooks/useActors"
import { getPluginUserState } from "../../../lib/getPluginUserState"
import { usePluginComponentContext } from "../context"
import { ExpiryBar } from "../../ExpiryBar"
import type { LyricHeroCardComponentProps } from "../../../types/PluginComponent"

interface PublicPuzzleToken {
  display: string
  revealed: boolean
  contributorUsername?: string
}

interface PublicPuzzleView {
  tokens: PublicPuzzleToken[]
  missedWords: string[]
  missesUsed: number
  missMax: number
  moodLabel: string
  walkedOut: boolean
  solved: boolean
  revealedPhrase?: string
  /** Optional guest-facing hint authored on the phrase. */
  hint?: string
}

interface AutoAdvanceDeadline {
  startAt: number
  endAt: number
}

interface LyricHeroUserBag {
  puzzle: PublicPuzzleView | null
  phraseIndex: number | null
  phraseTotal: number
  acceptingGuesses: boolean
  mode: string | null
}

/**
 * Lyric Hero puzzle card — blanks, crowd meter, and a one-word guess field.
 *
 * Cooperative: shared puzzle from the plugin store.
 * Competitive / inclusive: private puzzle from pluginUserState, with live
 * MY_PUZZLE events merging into the local plugin store for this client only.
 *
 * When auto-advance is counting down, an ExpiryBar drains at the bottom
 * (same pattern as QuizQuestionCard).
 */
export function LyricHeroCardTemplateComponent({
  hint = "Guess one word",
}: LyricHeroCardComponentProps) {
  const { store, pluginName } = usePluginComponentContext()
  const payload = useUserGameStatePayload()
  const bag = pluginName
    ? getPluginUserState<LyricHeroUserBag>(payload?.pluginUserState, pluginName)
    : null

  const roundActive = store.roundActive === true
  const mode = (store.mode as string | null | undefined) ?? bag?.mode ?? null
  const isCoop = mode === "cooperative" || mode == null

  const storePuzzle = store.puzzle as PublicPuzzleView | null | undefined
  // Cooperative: room store only. Solo: MY_PUZZLE merges into this client's store
  // (preferred over a stale pluginUserState bag from GET_MY_GAME_STATE).
  const puzzle: PublicPuzzleView | null = isCoop
    ? (storePuzzle ?? null)
    : (storePuzzle ?? bag?.puzzle ?? null)

  const phraseIndex =
    (typeof store.phraseIndex === "number" ? store.phraseIndex : null) ??
    bag?.phraseIndex ??
    null
  const phraseTotal =
    (typeof store.phraseTotal === "number" ? store.phraseTotal : null) ??
    bag?.phraseTotal ??
    0

  const acceptingGuesses = isCoop
    ? store.acceptingGuesses === true
    : typeof store.acceptingGuesses === "boolean"
      ? store.acceptingGuesses
      : (bag?.acceptingGuesses ?? false)

  const deadline = (store.autoAdvanceDeadline as AutoAdvanceDeadline | null | undefined) ?? null
  const showExpiryBar = deadline != null && deadline.endAt > Date.now()

  const inputDisabled =
    !acceptingGuesses ||
    !puzzle ||
    puzzle.solved ||
    puzzle.walkedOut ||
    !pluginName

  const [collapsed, setCollapsed] = useState(false)
  const [word, setWord] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = useCallback(() => {
    if (!pluginName || inputDisabled || submitting) return
    const trimmed = word.trim()
    if (!trimmed) return
    // Retain user-gesture audio unlock for async SOUND_EFFECT_QUEUED after the
    // socket round-trip (same pattern as track preview).
    unlockPreviewAudio()
    setSubmitting(true)
    emitToSocket("EXECUTE_PLUGIN_ACTION", {
      pluginName,
      action: "submitGuess",
      params: { word: trimmed },
    })
    setWord("")
    // Optimistic clear; server will push puzzle update. Release submit lock shortly.
    window.setTimeout(() => setSubmitting(false), 400)
  }, [pluginName, inputDisabled, submitting, word])

  if (!roundActive) return null
  // Solo modes may not have puzzle until bag hydrates; still show chrome.
  if (isCoop && !puzzle) return null

  const progress =
    phraseIndex != null && phraseTotal > 0
      ? `Phrase ${phraseIndex + 1} of ${phraseTotal}`
      : "Lyric Hero"

  const mood = puzzle?.moodLabel ?? "locked in"
  const missesUsed = puzzle?.missesUsed ?? 0
  const missMax = puzzle?.missMax ?? 6

  return (
    <Box width="full" px={2} pt={2}>
      <Box
        borderWidth="1px"
        borderRadius="lg"
        bg="bg"
        shadow="sm"
        overflow="hidden"
      >
        <Box px={4} pt={collapsed ? 2 : 3} pb={showExpiryBar ? 2 : collapsed ? 2 : 3}>
          <HStack justify="space-between" align="center" gap={2}>
            <HStack gap={2} minW={0} flex={1}>
              <Box color="primary.solid" flexShrink={0}>
                <LuMusic2 />
              </Box>
              {collapsed ? (
                <Text fontSize="sm" truncate>
                  Lyric Hero · {mood} · {missesUsed}/{missMax}
                </Text>
              ) : (
                <Text fontSize="xs" color="fg.muted">
                  {progress}
                  {mode ? ` · ${mode}` : ""}
                </Text>
              )}
            </HStack>
            <IconButton
              aria-label={collapsed ? "Expand Lyric Hero" : "Collapse Lyric Hero"}
              size="xs"
              variant="ghost"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <LuMaximize2 /> : <LuMinus />}
            </IconButton>
          </HStack>

          {!collapsed && (
            <VStack align="stretch" gap={3} mt={2} minW={0}>
              {puzzle ? (
                <HStack flexWrap="wrap" gap={2} rowGap={1} minW={0}>
                  {puzzle.tokens.map((t, i) => (
                    <Text
                      key={`${t.display}-${i}`}
                      fontFamily="mono"
                      fontWeight="semibold"
                      fontSize="md"
                      letterSpacing="0.08em"
                      lineHeight="short"
                      title={t.contributorUsername}
                      maxW="100%"
                      wordBreak="break-word"
                    >
                      {t.display}
                    </Text>
                  ))}
                </HStack>
              ) : (
                <Text fontSize="sm" color="fg.muted">
                  Loading your board…
                </Text>
              )}

              {puzzle?.hint ? (
                <Text fontSize="xs" color="fg.muted" wordBreak="break-word">
                  {puzzle.hint}
                </Text>
              ) : null}

              <HStack gap={2} flexWrap="wrap" minW={0}>
                <Badge colorPalette={puzzle?.walkedOut ? "red" : puzzle?.solved ? "green" : "purple"}>
                  Crowd: {mood}
                </Badge>
                <Badge variant="outline">
                  Notes {missesUsed}/{missMax}
                </Badge>
              </HStack>
              {puzzle?.missedWords?.length ? (
                <Text fontSize="xs" color="fg.muted" wordBreak="break-word">
                  Missed: {puzzle.missedWords.join(", ")}
                </Text>
              ) : null}

              {!puzzle?.solved && !puzzle?.walkedOut ? (
                <HStack gap={2} align="center">
                  <Input
                    size="sm"
                    placeholder={hint}
                    value={word}
                    disabled={inputDisabled}
                    onChange={(e) => setWord(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        submit()
                      }
                    }}
                    flex={1}
                    aria-label="Guess a word"
                  />
                  <IconButton
                    aria-label="Submit guess"
                    size="sm"
                    colorPalette="primary"
                    disabled={inputDisabled || !word.trim()}
                    loading={submitting}
                    onClick={submit}
                  >
                    <LuMusic2 />
                  </IconButton>
                </HStack>
              ) : (
                <Text fontSize="sm" color="fg.muted">
                  {puzzle?.solved
                    ? showExpiryBar
                      ? "Lyric complete — next phrase soon…"
                      : "Lyric complete."
                    : showExpiryBar
                      ? "The crowd walked out — next phrase soon…"
                      : "The crowd walked out."}
                </Text>
              )}
            </VStack>
          )}
        </Box>

        {showExpiryBar && (
          <ExpiryBar
            startAt={deadline.startAt}
            endAt={deadline.endAt}
            color="primary.solid"
            height="3px"
          />
        )}
      </Box>
    </Box>
  )
}

import React, { useEffect, useRef, useState, useCallback, memo, useMemo, RefObject } from "react"
import { createPortal } from "react-dom"

import { Box, IconButton, Flex, Icon, Image, Wrap, Textarea } from "@chakra-ui/react"
import { LuArrowUpCircle, LuImage, LuX } from "react-icons/lu"
import { debounce } from "lodash"

import MentionOverlay from "./MentionOverlay"
import ImageUpload from "./ImageUpload"
import {
  useCurrentUser,
  useIsAuthenticated,
  useAuthInitialized,
  useIsAdmin,
  useUsers,
  useIsAnyModalOpen,
  useSettings,
  useCurrentRoom,
} from "../hooks/useActors"
import { useMentionTrigger, type MentionUser } from "../hooks/useMentionTrigger"
import {
  encodePlainTextMentionsForServer,
  reconcileMentionRegistryWithText,
  type MentionPick,
} from "../lib/encodeChatMentions"
import { uploadImages } from "../lib/serverApi"

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB per image
const MAX_FILES = 5

const borderColor = "var(--chakra-colors-secondary-border, #ccc)"
const inputBackground = "var(--chakra-colors-secondary-bg, #f5f5f5)"

const isHeicFile = (file: File) =>
  file.type === "image/heic" ||
  file.type === "image/heif" ||
  file.name.toLowerCase().endsWith(".heic")

/**
 * Message payload - now just contains content string
 * Images are uploaded via HTTP and their markdown is appended to content
 */
export type MessagePayload = {
  content: string
}

interface Props {
  onTypingStart: () => void
  onTypingStop: () => void
  onSend: (value: MessagePayload) => void
  /** Container ref for rendering image previews via portal */
  imagePreviewContainer?: RefObject<HTMLDivElement | null>
}

const ChatInput = ({ onTypingStart, onTypingStop, onSend, imagePreviewContainer }: Props) => {
  const currentUser = useCurrentUser()
  const users = useUsers()
  const isAuthenticated = useIsAuthenticated()
  const isAuthInitialized = useAuthInitialized()
  const modalActive = useIsAnyModalOpen()
  const settings = useSettings()
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  // Room fetch (HTTP) often hydrates before socket ROOM_SETTINGS; use both so guests see the control after refresh.
  const guestChatImagesAllowed = settings.allowChatImages === true || room?.allowChatImages === true
  const canUseChatImages = isAdmin || guestChatImagesAllowed

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const submitStateRef = useRef({
    content: "",
    files: [] as File[],
    roomId: undefined as string | undefined,
    mentionRegistry: [] as MentionPick[],
    knownMentionDisplays: [] as string[],
  })
  const [isTyping, setTyping] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [content, setContent] = useState("")
  const [cursor, setCursor] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  /**
   * Overlay picks (ordered; supports duplicate display names).
   * Pruned on blur and again at submit via reconcileMentionRegistryWithText (not on every keystroke).
   */
  const [mentionRegistry, setMentionRegistry] = useState<MentionPick[]>([])

  const addImageFiles = useCallback(
    (incoming: File[]) => {
      if (!isAuthenticated || !isAuthInitialized || !canUseChatImages) return
      const valid = incoming.filter(
        (f) =>
          f.size <= MAX_FILE_SIZE &&
          (f.type.startsWith("image/") ||
            /\.(heic|heif|png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)),
      )
      if (valid.length === 0) return
      setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES))
    },
    [isAuthenticated, isAuthInitialized, canUseChatImages],
  )

  const handleTypingStop = useCallback(
    debounce(() => {
      setTyping(false)
    }, 2000),
    [],
  )

  useEffect(() => {
    if (isTyping) {
      onTypingStart()
    } else {
      onTypingStop()
    }
  }, [isTyping, onTypingStart, onTypingStop])

  const isValid = content !== "" || files.length > 0

  const recordPick = useCallback((user: MentionUser) => {
    const display = user.display.trim()
    setMentionRegistry((r) => [...r, { userId: user.id, display }])
  }, [])

  const handleKeyInput = useCallback(() => {
    setTyping(true)
    handleTypingStop()
  }, [handleTypingStop])

  const removeFileAt = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const filePreviewUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => {
    return () => {
      filePreviewUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [filePreviewUrls])

  const userSuggestions = useMemo(
    () =>
      users
        .filter(({ userId }) => userId !== currentUser?.userId)
        .map((x) => ({
          id: x.userId,
          display: (x.username ?? "").trim(),
        }))
        .filter((u) => u.display !== ""),
    [currentUser, users],
  )

  const knownMentionDisplays = useMemo(() => {
    const s = new Set<string>()
    for (const u of userSuggestions) s.add(u.display.trim())
    return [...s]
  }, [userSuggestions])

  const knownForScan = useMemo(() => {
    const s = new Set<string>(knownMentionDisplays)
    for (const p of mentionRegistry) s.add(p.display.trim())
    return [...s]
  }, [knownMentionDisplays, mentionRegistry])

  submitStateRef.current = {
    content,
    files,
    roomId: room?.id,
    mentionRegistry,
    knownMentionDisplays: knownForScan,
  }

  const mention = useMentionTrigger({
    value: content,
    onValueChange: setContent,
    cursor,
    onCursorChange: setCursor,
    users: userSuggestions,
    textareaRef,
    recordPick,
  })

  const handleMentionPick = useCallback(
    (user: MentionUser) => {
      mention.selectUser(user)
    },
    [mention],
  )

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault()

      const {
        content,
        files,
        roomId,
        mentionRegistry: registrySnapshot,
        knownMentionDisplays: knownSnapshot,
      } = submitStateRef.current
      const valid = content !== "" || files.length > 0
      if (!valid || !roomId) return
      if (!isAuthInitialized) {
        return
      }

      setSubmitting(true)

      try {
        let messageContent = content

        if (files.length > 0) {
          const uploadResult = await uploadImages(roomId, files)

          if (uploadResult.success && uploadResult.images.length > 0) {
            const imageMarkdown = uploadResult.images
              .map((img) => `![image](${img.url})`)
              .join("\n")
            messageContent = messageContent
              ? `${messageContent}\n\n${imageMarkdown}`
              : imageMarkdown
          }
        }

        const registryForEncode = reconcileMentionRegistryWithText(
          messageContent,
          registrySnapshot,
          knownSnapshot,
        )
        messageContent = encodePlainTextMentionsForServer(
          messageContent,
          registryForEncode,
          knownSnapshot,
        )

        onSend({ content: messageContent })

        setContent("")
        setFiles([])
        setCursor(0)
        setMentionRegistry([])
      } catch (error) {
        console.error("Error sending message:", error)
      } finally {
        setSubmitting(false)
      }
    },
    [onSend, isAuthInitialized],
  )

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value
      setContent(v)
      setCursor(e.target.selectionStart ?? v.length)
      if (v) {
        handleKeyInput()
      }
    },
    [handleKeyInput],
  )

  const handleTextareaSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursor(e.currentTarget.selectionStart ?? 0)
  }, [])

  const handleTextareaBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      const v = e.target.value
      setMentionRegistry((prev) =>
        reconcileMentionRegistryWithText(v, prev, knownForScan),
      )
    },
    [knownForScan],
  )

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      mention.handleKeyDown(e)
      if (e.defaultPrevented) return
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        void handleSubmit(e)
      }
    },
    [handleSubmit, mention],
  )

  if (!currentUser) {
    return null
  }

  const isFileUploadDisabled =
    !isAuthenticated || !isAuthInitialized || isSubmitting || files.length >= MAX_FILES

  const imagePreviews = useMemo(
    () =>
      canUseChatImages && files.length > 0 ? (
        <Wrap gap={2}>
          {files.map((file, index) => (
            <Box
              key={`${file.name}-${index}-${file.size}`}
              position="relative"
              borderRadius="md"
              overflow="hidden"
              width="fit-content"
            >
              {isHeicFile(file) ? (
                <Flex
                  align="center"
                  justify="center"
                  boxSize="60px"
                  bg="gray.100"
                  borderRadius="md"
                >
                  <Icon as={LuImage} boxSize={6} color="gray.400" />
                </Flex>
              ) : (
                <Image
                  src={filePreviewUrls[index] ?? ""}
                  alt={file.name}
                  boxSize="60px"
                  objectFit="cover"
                  borderRadius="md"
                />
              )}
              <IconButton
                aria-label="Remove image"
                size="xs"
                variant="solid"
                colorPalette="red"
                position="absolute"
                top={0}
                right={0}
                borderRadius="full"
                onClick={() => removeFileAt(index)}
              >
                <Icon as={LuX} boxSize={3} />
              </IconButton>
            </Box>
          ))}
        </Wrap>
      ) : null,
    [canUseChatImages, files, filePreviewUrls, removeFileAt],
  )

  const handlePasteImages = useCallback(
    (e: React.ClipboardEvent) => {
      if (!canUseChatImages || !isAuthenticated || !isAuthInitialized) return
      const fromClipboard = Array.from(e.clipboardData.files)
      const images = fromClipboard.filter((f) => f.type.startsWith("image/"))
      if (images.length === 0) return
      e.preventDefault()
      addImageFiles(images)
    },
    [addImageFiles, canUseChatImages, isAuthenticated, isAuthInitialized],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canUseChatImages || !isAuthenticated || !isAuthInitialized) return
      e.preventDefault()
      e.stopPropagation()
    },
    [canUseChatImages, isAuthenticated, isAuthInitialized],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canUseChatImages || !isAuthenticated || !isAuthInitialized) return
      e.preventDefault()
      e.stopPropagation()
      const dt = e.dataTransfer.files
      if (dt?.length) {
        addImageFiles(Array.from(dt))
      }
    },
    [addImageFiles, canUseChatImages, isAuthenticated, isAuthInitialized],
  )

  return (
    <>
      {imagePreviews &&
        imagePreviewContainer?.current &&
        createPortal(imagePreviews, imagePreviewContainer.current)}
      <form onSubmit={handleSubmit} onPaste={handlePasteImages} style={{ width: "100%" }}>
        <Flex
          direction="row"
          w="100%"
          grow={1}
          justify="center"
          overflowX="clip"
          gap={1}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {canUseChatImages && files.length < MAX_FILES && (
            <Box
              opacity={0}
              data-authenticated={isAuthenticated || undefined}
              css={{
                "&[data-authenticated]": {
                  opacity: 1,
                },
              }}
            >
              <ImageUpload onFilesPicked={addImageFiles} disabled={isFileUploadDisabled} />
            </Box>
          )}

          <Box
            w="100%"
            opacity={0}
            position="relative"
            data-authenticated={isAuthenticated || undefined}
            css={{
              "&[data-authenticated]": {
                opacity: 1,
              },
            }}
          >
            {mention.isActive && (
              <MentionOverlay
                users={mention.filteredUsers}
                highlightedIndex={mention.highlightedIndex}
                onHighlightIndex={mention.setHighlightedIndex}
                onSelect={handleMentionPick}
                placement="above"
              />
            )}
            <Textarea
              ref={textareaRef}
              name="content"
              autoComplete="off"
              rows={1}
              value={content}
              onChange={handleTextareaChange}
              onBlur={handleTextareaBlur}
              onSelect={handleTextareaSelect}
              onClick={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
              onKeyDown={handleTextareaKeyDown}
              autoFocus={modalActive}
              disabled={!isAuthenticated || !isAuthInitialized}
              placeholder={
                !isAuthenticated
                  ? ""
                  : !isAuthInitialized
                    ? "Syncing session…"
                    : "Say something..."
              }
              w="100%"
              resize="none"
              minH="36px"
              maxH="120px"
              m={0}
              p="6px"
              fontSize="1rem"
              lineHeight="1.4"
              borderWidth={1}
              borderStyle="solid"
              borderColor={borderColor}
              borderRadius="4px"
              bg={inputBackground}
              css={{
                fieldSizing: "content",
              }}
            />
          </Box>
          <Box
            transition="width 0.2s, opacity 0.2s"
            width="5px"
            opacity={0}
            overflow="hidden"
            data-valid={isValid || undefined}
            css={{
              "&[data-valid]": {
                width: "auto",
                opacity: 1,
              },
            }}
          >
            <IconButton
              aria-label="Send Message"
              type="submit"
              variant="ghost"
              disabled={isSubmitting || !isValid || !isAuthInitialized}
              colorPalette="action"
              css={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
            >
              <Icon as={LuArrowUpCircle} />
            </IconButton>
          </Box>
        </Flex>
      </form>
    </>
  )
}

export default memo(ChatInput)

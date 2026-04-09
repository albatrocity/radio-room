import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
  ReactNode,
  ReactPortal,
  useMemo,
  RefObject,
} from "react"
import { createPortal } from "react-dom"

import { Box, IconButton, Flex, Icon, Text, Image, Wrap } from "@chakra-ui/react"
import { FiArrowUpCircle, FiX, FiImage } from "react-icons/fi"
import { MentionsInput, Mention } from "react-mentions"
import { debounce } from "lodash"

import MentionSuggestionsContainer from "./MentionSuggestionsContainer"
import ImageUpload from "./ImageUpload"
import {
  useCurrentUser,
  useIsAuthenticated,
  useIsAdmin,
  useUsers,
  useIsAnyModalOpen,
  useSettings,
  useCurrentRoom,
} from "../hooks/useActors"
import { uploadImages } from "../lib/serverApi"

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB per image
const MAX_FILES = 5

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

const renderUserSuggestion = (
  suggestion: any,
  search: any,
  highlightedDisplay: any,
  index: any,
  focused: any,
) => {
  return (
    <Box
      backgroundColor={focused ? "actionBgLite" : "transparent"}
      className={`user ${focused ? "focused" : ""}`}
      px={2}
      py={1}
    >
      <Text fontSize="xs">{highlightedDisplay}</Text>
    </Box>
  )
}

type InputProps = {
  inputRef: RefObject<ReactPortal | undefined>
  inputStyle: any
  handleKeyInput: () => void
  userSuggestions: { id: string; display: string }[]
  mentionStyle: any
  renderUserSuggestion: (
    suggestion: any,
    search: any,
    highlightedDisplay: any,
    index: any,
    focused: any,
  ) => ReactNode
  autoFocus: boolean
  value: string
  onChange: (value: string) => void
  handleSubmit: (e: React.SyntheticEvent) => void
  isDisabled: boolean
}

const Input = memo(
  ({
    inputRef,
    inputStyle,
    handleKeyInput,
    userSuggestions,
    mentionStyle,
    renderUserSuggestion,
    autoFocus,
    value,
    onChange,
    handleSubmit,
    isDisabled = false,
  }: InputProps) => (
    <MentionsInput
      name="content"
      allowSuggestionsAboveCursor={true}
      forceSuggestionsAboveCursor={true}
      customSuggestionsContainer={MentionSuggestionsContainer}
      inputRef={inputRef as any}
      style={inputStyle}
      value={value}
      autoFocus={autoFocus}
      autoComplete="off"
      onKeyDown={(e) => {
        if (e.keyCode === 13 && !e.shiftKey) {
          handleSubmit(e)
        }
      }}
      onChange={(e) => {
        if (e.target.value && e.target.value !== "") {
          handleKeyInput()
        }
        onChange(e.target.value)
      }}
      placeholder={isDisabled ? "" : "Say something..."}
      disabled={isDisabled}
    >
      <Mention
        trigger="@"
        appendSpaceOnAdd={true}
        data={userSuggestions}
        style={mentionStyle}
        renderSuggestion={renderUserSuggestion}
      />
    </MentionsInput>
  ),
)
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
  const modalActive = useIsAnyModalOpen()
  const settings = useSettings()
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  // Room fetch (HTTP) often hydrates before socket ROOM_SETTINGS; use both so guests see the control after refresh.
  const guestChatImagesAllowed =
    settings.allowChatImages === true || room?.allowChatImages === true
  const canUseChatImages = isAdmin || guestChatImagesAllowed

  const inputRef = useRef<ReactPortal>(null)
  const [isTyping, setTyping] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [content, setContent] = useState("")
  const [files, setFiles] = useState<File[]>([])

  const addImageFiles = useCallback(
    (incoming: File[]) => {
      if (!isAuthenticated || !canUseChatImages) return
      const valid = incoming.filter(
        (f) =>
          f.size <= MAX_FILE_SIZE &&
          (f.type.startsWith("image/") ||
            /\.(heic|heif|png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)),
      )
      if (valid.length === 0) return
      setFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES))
    },
    [isAuthenticated, canUseChatImages],
  )

  // Use CSS variables for colors
  const borderColor = "var(--chakra-colors-secondary-border, #ccc)"
  const inputBackground = "var(--chakra-colors-secondary-bg, #f5f5f5)"

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
  }, [isTyping])

  // Message is valid if there's content or images
  const isValid = content !== "" || files.length > 0

  const handleKeyInput = useCallback(() => {
    setTyping(true)
    handleTypingStop()
  }, [])

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
        .filter(({ userId }) => userId !== currentUser.userId)
        .map((x) => ({
          id: x.userId,
          display: x.username,
        })),
    [currentUser, users],
  )

  const mentionStyle = {
    fontWeight: 700,
    height: "100%",
  }

  const inputStyle = {
    control: {
      backgroundColor: "transparent",
      fontWeight: "normal",
    },

    highlighter: {
      overflow: "hidden",
      padding: 0,
      border: "none",
      height: "100%",
    },

    input: {
      margin: 0,
      width: "100%",
      border: `1px solid ${borderColor}`,
      borderRadius: "4px",
      padding: "6px",
      fontSize: "1rem",
      background: inputBackground,
    },

    suggestions: {
      backgroundColor: "transparent",
      boxShadow: `0 2px 2px rgba(0, 0, 0, 0.2)`,
    },
  }

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault()

    if (!isValid || !room?.id) return

    setSubmitting(true)

    try {
      let messageContent = content

      // Upload images via HTTP if any are selected
      if (files.length > 0) {
        const uploadResult = await uploadImages(room.id, files)

        if (uploadResult.success && uploadResult.images.length > 0) {
          // Append markdown image tags to the message content
          const imageMarkdown = uploadResult.images.map((img) => `![image](${img.url})`).join("\n")
          messageContent = messageContent ? `${messageContent}\n\n${imageMarkdown}` : imageMarkdown
        }
      }

      // Send the message via WebSocket
      onSend({ content: messageContent })

      // Clear the form
      setContent("")
      setFiles([])
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setSubmitting(false)
    }
  }

  if (!currentUser) {
    return null
  }

  const isFileUploadDisabled =
    !isAuthenticated || isSubmitting || files.length >= MAX_FILES

  // Previews follow React `files` state (source of truth for submit); not FileUpload.Context.
  const imagePreviews =
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
                <Icon as={FiImage} boxSize={6} color="gray.400" />
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
              <Icon as={FiX} boxSize={3} />
            </IconButton>
          </Box>
        ))}
      </Wrap>
    ) : null

  const handlePasteImages = useCallback(
    (e: React.ClipboardEvent) => {
      if (!canUseChatImages || !isAuthenticated) return
      const fromClipboard = Array.from(e.clipboardData.files)
      const images = fromClipboard.filter((f) => f.type.startsWith("image/"))
      if (images.length === 0) return
      e.preventDefault()
      addImageFiles(images)
    },
    [addImageFiles, canUseChatImages, isAuthenticated],
  )

  return (
    <>
      {/* Portal image previews to container if provided */}
      {imagePreviews &&
        imagePreviewContainer?.current &&
        createPortal(imagePreviews, imagePreviewContainer.current)}
      <form
        onSubmit={handleSubmit}
        onPaste={handlePasteImages}
        style={{ width: "100%" }}
      >
        <Flex
          direction="row"
          w="100%"
          grow={1}
          justify="center"
          overflowX="clip"
          gap={1}
          onDragOver={(e) => {
            if (!canUseChatImages || !isAuthenticated) return
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={(e) => {
            if (!canUseChatImages || !isAuthenticated) return
            e.preventDefault()
            e.stopPropagation()
            const dt = e.dataTransfer.files
            if (dt?.length) {
              addImageFiles(Array.from(dt))
            }
          }}
        >
          {/* Image upload button */}
          {canUseChatImages && files.length < MAX_FILES && (
            <Box opacity={isAuthenticated ? 1 : 0}>
              <ImageUpload
                onFilesPicked={addImageFiles}
                disabled={isFileUploadDisabled}
              />
            </Box>
          )}

          <Box
            w="100%"
            opacity={isAuthenticated ? 1 : 0}
            css={{
              "& > div": {
                height: "100%",
              },
            }}
          >
            <Input
              onChange={(value: string) => {
                setContent(value)
              }}
              handleSubmit={handleSubmit}
              value={content}
              inputRef={inputRef}
              inputStyle={inputStyle}
              handleKeyInput={handleKeyInput}
              userSuggestions={userSuggestions}
              mentionStyle={mentionStyle}
              renderUserSuggestion={renderUserSuggestion}
              autoFocus={modalActive}
              isDisabled={!isAuthenticated}
            />
          </Box>
          <Box
            transition="width 0.2s, opacity 0.2s"
            width={isValid ? "auto" : "5px"}
            opacity={isValid ? 1 : 0}
            overflow="hidden"
          >
            <IconButton
              aria-label="Send Message"
              type="submit"
              variant="ghost"
              disabled={isSubmitting || !isValid}
              colorPalette="action"
              css={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
            >
              <Icon as={FiArrowUpCircle} />
            </IconButton>
          </Box>
        </Flex>
      </form>
    </>
  )
}

export default memo(ChatInput)

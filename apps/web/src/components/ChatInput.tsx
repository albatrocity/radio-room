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

import {
  Box,
  IconButton,
  Flex,
  Icon,
  Spacer,
  Text,
  FileUpload,
  useFileUpload,
  HStack,
  Image,
  Wrap,
} from "@chakra-ui/react"
import { FiArrowUpCircle, FiX } from "react-icons/fi"
import { MentionsInput, Mention } from "react-mentions"
import { debounce } from "lodash"

import MentionSuggestionsContainer from "./MentionSuggestionsContainer"
import ImageUpload from "./ImageUpload"
import { useCurrentUser, useIsAuthenticated, useUsers, useIsAnyModalOpen } from "../hooks/useActors"
import { fileToBase64 } from "../lib/image"

const MAX_FILE_SIZE = 4 * 1024 * 1024 // 4MB per image
const MAX_FILES = 5

/**
 * Image data to be sent with a message
 */
export type ImageData = {
  data: string // base64 encoded
  mimeType: string
}

/**
 * Message payload that can include images
 */
export type MessagePayload = {
  content: string
  images?: ImageData[]
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

  const inputRef = useRef<ReactPortal>(null)
  const [isTyping, setTyping] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [content, setContent] = useState("")
  const [files, setFiles] = useState<File[]>([])

  const fileUpload = useFileUpload({
    accept: ["image/*"],
    maxFiles: MAX_FILES,
    maxFileSize: MAX_FILE_SIZE,
    onFileChange: (details) => {
      // isInternalUpdate.current = true
      handleFilesChange(details.acceptedFiles)
    },
  })

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

  const handleFilesChange = useCallback((newFiles: File[]) => {
    setFiles(newFiles)
  }, [])

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

    if (!isValid) return

    setSubmitting(true)

    try {
      // Convert files to base64 ImageData
      const images: ImageData[] = await Promise.all(
        files.map(async (file) => ({
          data: await fileToBase64(file),
          mimeType: file.type,
        })),
      )

      // Send the message payload
      onSend({
        content,
        images: images.length > 0 ? images : undefined,
      })

      // Clear the form
      setContent("")
      setFiles([])
    } catch (error) {
      console.error("Error preparing message:", error)
    } finally {
      setSubmitting(false)
    }
  }

  if (!currentUser) {
    return null
  }

  const isFileUploadDisabled = !isAuthenticated || isSubmitting || files.length < MAX_FILES

  // Image preview component - rendered via portal if container provided
  const imagePreviews =
    files.length > 0 ? (
      <FileUpload.ItemGroup>
        <Wrap gap={2}>
          <FileUpload.Context>
            {({ acceptedFiles }) =>
              acceptedFiles.map((file, index) => (
                <FileUpload.Item
                  key={`${file.name}-${index}`}
                  file={file}
                  css={{ width: "fit-content" }}
                >
                  <Box position="relative" borderRadius="md" overflow="hidden">
                    <FileUpload.ItemPreview type="image/*">
                      <Image
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        boxSize="60px"
                        objectFit="cover"
                        borderRadius="md"
                      />
                    </FileUpload.ItemPreview>
                    <FileUpload.ItemDeleteTrigger asChild>
                      <IconButton
                        aria-label="Remove image"
                        size="xs"
                        variant="solid"
                        colorPalette="red"
                        position="absolute"
                        top={0}
                        right={0}
                        borderRadius="full"
                      >
                        <Icon as={FiX} boxSize={3} />
                      </IconButton>
                    </FileUpload.ItemDeleteTrigger>
                  </Box>
                </FileUpload.Item>
              ))
            }
          </FileUpload.Context>
        </Wrap>
      </FileUpload.ItemGroup>
    ) : null

  return (
    <FileUpload.RootProvider value={fileUpload}>
      {/* Portal image previews to container if provided */}
      {imagePreviews &&
        imagePreviewContainer?.current &&
        createPortal(imagePreviews, imagePreviewContainer.current)}
      <form onSubmit={handleSubmit} style={{ width: "100%" }}>
        <Flex direction="row" w="100%" grow={1} justify="center" overflowX="clip" gap={1}>
          {/* Image upload button */}
          {files.length === 0 && (
            <Box opacity={isAuthenticated ? 1 : 0}>
              <ImageUpload
                files={files}
                disabled={isFileUploadDisabled}
                fileUpload={fileUpload}
                maxFiles={MAX_FILES}
                maxFileSize={MAX_FILE_SIZE}
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
    </FileUpload.RootProvider>
  )
}

export default memo(ChatInput)

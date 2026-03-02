import { memo, useCallback, useEffect, useRef } from "react"
import {
  Box,
  Button,
  FileUpload,
  HStack,
  Icon,
  IconButton,
  Image,
  Menu,
  Portal,
  Text,
  useFileUpload,
} from "@chakra-ui/react"
import { FiCamera, FiImage, FiUpload, FiX } from "react-icons/fi"

export type ImageFile = {
  file: File
  preview: string
}

interface ImageUploadProps {
  fileUpload: ReturnType<typeof useFileUpload>

  /** Current files (controlled) */
  files: File[]
  /** Whether the upload is disabled */
  disabled?: boolean
  maxFiles: number
  maxFileSize: number
}

/**
 * Image upload component with:
 * - File picker button
 * - Camera capture button (mobile)
 * - Drag & drop dropzone
 * - Clipboard paste support
 * - Image preview thumbnails
 */
const ImageUpload = ({
  fileUpload,
  files,
  disabled = false,
  maxFiles,
  maxFileSize,
}: ImageUploadProps) => {
  const isInternalUpdate = useRef(false)

  // Sync external files prop with internal state
  // This handles the case when files are cleared externally (e.g., after submit)
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false
      return
    }

    // If external files is empty but internal has files, clear internal
    if (files.length === 0 && fileUpload.acceptedFiles.length > 0) {
      fileUpload.clearFiles()
    }
  }, [files, fileUpload])

  // Handle paste events
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.files)
      const imageFiles = items.filter((file) => file.type.startsWith("image/"))

      if (imageFiles.length > 0) {
        e.preventDefault()
        const currentFiles = fileUpload.acceptedFiles
        const newFiles = [...currentFiles, ...imageFiles].slice(0, MAX_FILES)
        fileUpload.setFiles(newFiles)
      }
    },
    [fileUpload],
  )

  const hasFiles = files.length > 0

  return (
    <Box onPaste={handlePaste}>
      <Menu.Root>
        <Menu.Trigger asChild>
          <IconButton variant="ghost">
            <Icon as={FiImage} />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              <FileUpload.Trigger asChild>
                <Menu.Item value="upload" disabled={disabled}>
                  <FileUpload.HiddenInput />
                  {/* File picker button */}
                  <Icon as={FiUpload} />
                  Upload
                </Menu.Item>
              </FileUpload.Trigger>
              <FileUpload.Trigger asChild>
                <Menu.Item value="camera" disabled={disabled}>
                  <FileUpload.HiddenInput capture="environment" />
                  <Icon as={FiCamera} />
                  Take photo
                </Menu.Item>
              </FileUpload.Trigger>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>

      {/* Dropzone hint when dragging */}
      <FileUpload.Dropzone
        position="fixed"
        top={0}
        left={0}
        right={0}
        bottom={0}
        zIndex={1000}
        bg="blackAlpha.700"
        display="none"
        alignItems="center"
        justifyContent="center"
        css={{
          "&[data-dragging]": {
            display: "flex",
          },
        }}
      >
        <Box textAlign="center" color="white">
          <Icon as={FiImage} boxSize={12} mb={2} />
          <Text fontSize="lg" fontWeight="bold">
            Drop images here
          </Text>
          <Text fontSize="sm" opacity={0.8}>
            Up to {maxFiles} images, max {maxFileSize / 1024 / 1024}MB each
          </Text>
        </Box>
      </FileUpload.Dropzone>
    </Box>
  )
}

export default memo(ImageUpload)

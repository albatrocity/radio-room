import React, { useCallback, useRef, useState } from "react"
import {
  Box,
  Button,
  Progress,
  Text,
  VStack,
} from "@chakra-ui/react"
import { toaster } from "./ui/toaster"
import {
  completeMusicUpload,
  failMusicUpload,
  presignMusicUpload,
} from "../lib/serverApi"
import { HTTPError } from "ky"

const ACCEPT =
  ".mp3,.wav,.flac,.aiff,.aif,.m4a,.aac,.ogg,.zip,.rar,.7z,audio/*,application/zip,application/x-rar-compressed,application/vnd.rar,application/x-7z-compressed"

const MAX_BYTES = 800 * 1024 * 1024

async function uploadErrorMessage(error: unknown): Promise<string> {
  if (error instanceof HTTPError) {
    try {
      const body = (await error.response.json()) as { error?: string }
      if (body.error) return body.error
    } catch {
      /* ignore */
    }
    return error.message
  }
  if (error instanceof Error) return error.message
  return "Upload failed"
}

interface MusicUploadPanelProps {
  roomId: string
  onClose?: () => void
}

function uploadWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed (${xhr.status})`))
      }
    }

    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.onabort = () => reject(new Error("Upload aborted"))

    xhr.send(file)
  })
}

export function MusicUploadPanel({ roomId, onClose }: MusicUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
    setProgress(null)
    e.target.value = ""
  }, [])

  const handleUpload = useCallback(async () => {
    if (!selectedFile || isUploading) return

    if (selectedFile.size > MAX_BYTES) {
      toaster.create({
        title: "File too large",
        description: "Maximum upload size is 800 MB.",
        type: "error",
      })
      return
    }

    const contentType = selectedFile.type || "application/octet-stream"
    setIsUploading(true)
    setProgress(0)

    let presignResult: Awaited<ReturnType<typeof presignMusicUpload>> | null = null

    try {
      presignResult = await presignMusicUpload(roomId, {
        filename: selectedFile.name,
        contentType,
        contentLength: selectedFile.size,
      })

      await uploadWithProgress(presignResult.uploadUrl, selectedFile, setProgress)

      await completeMusicUpload(roomId, {
        uploadId: presignResult.uploadId,
        key: presignResult.key,
      })

      toaster.create({
        title: "Upload complete",
        description: selectedFile.name,
        type: "success",
      })
      setSelectedFile(null)
      setProgress(null)
      onClose?.()
    } catch (error) {
      const message = await uploadErrorMessage(error)
      if (presignResult) {
        try {
          await failMusicUpload(roomId, {
            uploadId: presignResult.uploadId,
            key: presignResult.key,
            reason: message,
          })
        } catch {
          /* best effort */
        }
      }
      toaster.create({
        title: "Upload failed",
        description: message,
        type: "error",
      })
      setProgress(null)
    } finally {
      setIsUploading(false)
    }
  }, [isUploading, onClose, roomId, selectedFile])

  return (
    <VStack align="stretch" gap={4}>
      <Text fontSize="sm" color="fg.muted">
        Audio (mp3, wav, flac, aiff, m4a, aac, ogg) and archives (zip, rar, 7z). Max 800 MB.
        Files are private and expire after 30 days.
      </Text>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <Button
        variant="outline"
        size="sm"
        alignSelf="flex-start"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </Button>

      {selectedFile ? (
        <Box>
          <Text fontSize="sm" fontWeight="medium">
            {selectedFile.name}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
          </Text>
        </Box>
      ) : null}

      {progress !== null ? (
        <Progress.Root value={Math.round(progress * 100)} max={100}>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      ) : null}

      <Button
        colorPalette="primary"
        loading={isUploading}
        disabled={!selectedFile}
        onClick={handleUpload}
      >
        Upload
      </Button>
    </VStack>
  )
}

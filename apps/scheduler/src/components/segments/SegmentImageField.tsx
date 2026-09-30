import { useRef } from "react"
import { Box, Button, HStack, Image, Text } from "@chakra-ui/react"
import type { SegmentDTO } from "@repo/types"
import { useSetSegmentImage } from "../../hooks/useSegments"

interface SegmentImageFieldProps {
  segment: SegmentDTO
}

/**
 * Uploads apply immediately (not on form Save). The image is the Now Playing
 * cover while this segment is active and track detection is off (ADR 0195).
 */
export function SegmentImageField({ segment }: SegmentImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const setImage = useSetSegmentImage()

  const handleFile = (file: File | undefined) => {
    if (!file) return
    setImage.mutate(
      { id: segment.id, file },
      {
        onSettled: () => {
          if (inputRef.current) inputRef.current.value = ""
        },
      },
    )
  }

  return (
    <Box>
      <Box mb={1} fontSize="sm" fontWeight="medium">
        Image
      </Box>
      {segment.imageUrl && (
        <Image
          src={segment.imageUrl}
          alt=""
          boxSize="160px"
          objectFit="cover"
          borderRadius="md"
          mb={2}
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <HStack gap={2}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          loading={setImage.isPending && setImage.variables?.file !== null}
          disabled={setImage.isPending}
        >
          {segment.imageUrl ? "Replace image" : "Upload image"}
        </Button>
        {segment.imageUrl && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            colorPalette="red"
            onClick={() => setImage.mutate({ id: segment.id, file: null })}
            loading={setImage.isPending && setImage.variables?.file === null}
            disabled={setImage.isPending}
          >
            Remove
          </Button>
        )}
      </HStack>
      {setImage.error && (
        <Text fontSize="xs" color="fg.error" mt={1}>
          {setImage.error.message}
        </Text>
      )}
      <Text fontSize="xs" color="fg.muted" mt={1}>
        Shown in Now Playing while this segment is active and track detection is off. Saved
        immediately.
      </Text>
    </Box>
  )
}

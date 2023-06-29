import React, { FormEvent, useEffect, useRef } from "react"
import { Box, Button, HStack, Text, Input } from "@chakra-ui/react"

interface Props {
  isEditing: boolean
  onEdit: () => void
  onSave: (event: FormEvent) => void
  isLoading: boolean
  onChange: (name: string) => void
  value: string | undefined
  trackCount: number
}

const DrawerPlaylistFooter = ({
  isEditing,
  onEdit,
  onSave,
  isLoading,
  onChange,
  value,
  trackCount,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing, inputRef.current])
  return (
    <Box as="form" onSubmit={onSave} w="100%">
      <Box w="100%">
        {isEditing ? (
          <HStack justifyContent="space-between" w="100%">
            <Button onClick={onEdit} variant="ghost">
              Cancel
            </Button>
            <HStack>
              <Box flexShrink={0}>
                <Text>{trackCount} Tracks</Text>
              </Box>
              <Input
                name="name"
                placeholder="Playlist name"
                autoFocus
                value={value}
                onChange={(e) => onChange(e.target.value)}
                ref={inputRef}
              />
              <Button
                onClick={onSave}
                isLoading={isLoading}
                isDisabled={isLoading || trackCount === 0}
                type="submit"
              >
                Save
              </Button>
            </HStack>
          </HStack>
        ) : (
          <HStack justifyContent="end">
            <Button variant="outline" onClick={onEdit}>
              Save Playlist
            </Button>
          </HStack>
        )}
      </Box>
    </Box>
  )
}

export default DrawerPlaylistFooter
